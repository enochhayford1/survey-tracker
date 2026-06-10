'use strict';

const QUESTION_STARTERS = /^(how|what|which|why|when|where|who|is|are|can|could|should|does|do|did|anyone|any|has|have|will|would|am i|best way)\b/i;

function isQuestion(title) {
  const t = title.trim();
  return t.includes('?') || QUESTION_STARTERS.test(t);
}

function engagement(post) {
  // Comments weigh double: discussion signals an unanswered/contested question.
  return (post.score || 0) + 2 * (post.num_comments || 0);
}

function withinDays(post, days, now = Date.now()) {
  return post.created_utc * 1000 >= now - days * 86400000;
}

/** Top N question posts within the window, ranked by engagement, deduped by normalized title. */
function topQuestions(posts, days, { limit = 20, now = Date.now() } = {}) {
  const seen = new Set();
  return posts
    .filter((p) => withinDays(p, days, now) && isQuestion(p.title))
    .sort((a, b) => engagement(b) - engagement(a))
    .filter((p) => {
      const key = p.title.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit)
    .map((p) => ({
      title: p.title,
      score: p.score,
      comments: p.num_comments,
      engagement: engagement(p),
      subreddit: p.subreddit,
      url: `https://www.reddit.com${p.permalink}`,
      createdUtc: p.created_utc
    }));
}

function aliasRegex(aliases) {
  const escaped = aliases.map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`\\b(${escaped.join('|')})\\b`, 'i');
}

/**
 * Mention counts per site within the window, with the immediately preceding
 * window of equal length for trend comparison.
 */
function siteMentions(posts, days, sites, { now = Date.now() } = {}) {
  const current = posts.filter((p) => withinDays(p, days, now));
  const previous = posts.filter((p) => !withinDays(p, days, now) && withinDays(p, days * 2, now));
  const results = sites.map((site) => {
    const re = aliasRegex(site.aliases);
    const matches = current.filter((p) => re.test(`${p.title} ${p.selftext || ''}`));
    const prevCount = previous.filter((p) => re.test(`${p.title} ${p.selftext || ''}`)).length;
    return {
      id: site.id,
      name: site.name,
      mentions: matches.length,
      engagement: matches.reduce((sum, p) => sum + engagement(p), 0),
      prevMentions: prevCount,
      topPost: matches.sort((a, b) => engagement(b) - engagement(a))[0]?.title || null
    };
  });
  return results.filter((r) => r.mentions > 0).sort((a, b) => b.mentions - a.mentions || b.engagement - a.engagement);
}

/** Posts from the last `hours` ranked by engagement velocity (engagement per hour of age). */
function risingTopics(posts, { hours = 48, limit = 10, now = Date.now() } = {}) {
  return posts
    .filter((p) => p.created_utc * 1000 >= now - hours * 3600000)
    .map((p) => {
      const ageHours = Math.max(1, (now - p.created_utc * 1000) / 3600000);
      return { ...p, velocity: engagement(p) / ageHours };
    })
    .sort((a, b) => b.velocity - a.velocity)
    .slice(0, limit)
    .map((p) => ({
      title: p.title,
      score: p.score,
      comments: p.num_comments,
      velocity: Math.round(p.velocity * 10) / 10,
      subreddit: p.subreddit,
      url: `https://www.reddit.com${p.permalink}`,
      createdUtc: p.created_utc
    }));
}

const NEGATIVE_TERMS = [
  'scam', 'banned', 'ban ', 'suspended', 'deactivated', 'account closed', 'not paying',
  'never paid', "didn't pay", 'didnt pay', 'withheld', 'ghosted', 'lowered', 'devaluation',
  'rip-off', 'ripoff', 'warning', 'avoid', 'shadowban'
];

/**
 * Per-site negative-mention scan: posts that mention the site AND a negative
 * term. High counts mean reconsider promoting that site (or write a "is X a
 * scam?" article — those convert).
 */
function reputation(posts, days, sites, { now = Date.now() } = {}) {
  const windowPosts = posts.filter((p) => withinDays(p, days, now));
  return sites
    .map((site) => {
      const re = aliasRegex(site.aliases);
      const flagged = windowPosts.filter((p) => {
        const text = `${p.title} ${p.selftext || ''}`.toLowerCase();
        return re.test(text) && NEGATIVE_TERMS.some((t) => text.includes(t));
      });
      const total = windowPosts.filter((p) => re.test(`${p.title} ${p.selftext || ''}`)).length;
      return {
        id: site.id,
        name: site.name,
        negative: flagged.length,
        total,
        ratio: total ? Math.round((flagged.length / total) * 100) : 0,
        samples: flagged
          .sort((a, b) => engagement(b) - engagement(a))
          .slice(0, 3)
          .map((p) => ({ title: p.title, url: `https://www.reddit.com${p.permalink}`, score: p.score }))
      };
    })
    .filter((r) => r.negative > 0)
    .sort((a, b) => b.negative - a.negative);
}

/** Posts in the window matching any watchlist term. */
function watchlistMatches(posts, terms, days, { now = Date.now() } = {}) {
  return terms.map((term) => {
    const needle = term.toLowerCase();
    const matches = posts
      .filter((p) => withinDays(p, days, now) && `${p.title} ${p.selftext || ''}`.toLowerCase().includes(needle))
      .sort((a, b) => engagement(b) - engagement(a))
      .slice(0, 5)
      .map((p) => ({ title: p.title, url: `https://www.reddit.com${p.permalink}`, score: p.score, comments: p.num_comments, createdUtc: p.created_utc }));
    return { term, count: matches.length, matches };
  });
}

module.exports = { isQuestion, engagement, topQuestions, siteMentions, risingTopics, reputation, watchlistMatches, NEGATIVE_TERMS };
