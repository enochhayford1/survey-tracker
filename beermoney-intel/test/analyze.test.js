'use strict';

const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');

const analyze = require('../lib/analyze');
const { SEED_SITES } = require('../lib/sites');
const { buildSamplePosts } = require('../lib/sample-data');
const { generateIdeas } = require('../lib/ideas');
const store = require('../lib/store');

const NOW = Date.now();
const posts = buildSamplePosts(NOW);

// --- isQuestion ---
assert.ok(analyze.isQuestion('Is Swagbucks worth it?'));
assert.ok(analyze.isQuestion('How much can you make on Prolific'));
assert.ok(!analyze.isQuestion('My monthly earnings report'));

// --- topQuestions ---
for (const days of [30, 60, 90]) {
  const qs = analyze.topQuestions(posts, days, { now: NOW });
  assert.ok(qs.length > 0, `topQuestions(${days}) should return results`);
  assert.ok(qs.length <= 20, 'capped at 20');
  for (let i = 1; i < qs.length; i++) {
    assert.ok(qs[i - 1].engagement >= qs[i].engagement, 'sorted by engagement');
  }
  for (const q of qs) {
    assert.ok(q.createdUtc * 1000 >= NOW - days * 86400000, 'within window');
    assert.ok(analyze.isQuestion(q.title), 'every result is a question');
  }
}
const q90 = analyze.topQuestions(posts, 90, { now: NOW });
const q30 = analyze.topQuestions(posts, 30, { now: NOW });
assert.ok(q90.length >= q30.length, 'larger window includes at least as many');

// --- siteMentions ---
const mentions = analyze.siteMentions(posts, 90, SEED_SITES, { now: NOW });
assert.ok(mentions.length > 3, 'multiple sites detected');
assert.ok(mentions.every((m) => m.mentions > 0));
for (let i = 1; i < mentions.length; i++) {
  assert.ok(mentions[i - 1].mentions >= mentions[i].mentions, 'sorted by mentions');
}
const swag = mentions.find((m) => m.id === 'swagbucks');
assert.ok(swag && swag.mentions >= 3, 'Swagbucks heavily mentioned in sample data');

// Alias matching is word-boundary: "prolific" should not match "prolifically".
const fake = [{ id: 'x', title: 'He wrote prolifically about money', selftext: '', score: 1, num_comments: 0, created_utc: NOW / 1000 - 100, subreddit: 'test', permalink: '/x' }];
assert.strictEqual(analyze.siteMentions(fake, 30, SEED_SITES, { now: NOW }).length, 0, 'no substring false positives');

// --- risingTopics ---
const rising = analyze.risingTopics(posts, { now: NOW });
assert.ok(rising.length >= 2, 'demo data includes recent posts');
assert.ok(rising.every((p) => p.createdUtc * 1000 >= NOW - 48 * 3600000));

// --- reputation ---
const rep = analyze.reputation(posts, 90, SEED_SITES, { now: NOW });
assert.ok(rep.length > 0, 'negative mentions detected');
const swagRep = rep.find((r) => r.id === 'swagbucks');
assert.ok(swagRep, 'Swagbucks ban post flagged');
assert.ok(swagRep.samples.length > 0 && swagRep.samples[0].url.startsWith('https://www.reddit.com'));

// --- demo data permalinks point at each post's own subreddit ---
for (const p of posts) {
  assert.ok(p.permalink.startsWith(`/r/${p.subreddit}/`), `permalink matches subreddit: ${p.permalink} vs r/${p.subreddit}`);
  assert.ok(p.permalink.includes(encodeURIComponent(p.title).slice(0, 20)), 'permalink deep-links to a search for the title');
}
const demoQuestions = analyze.topQuestions(posts, 90, { now: NOW });
assert.ok(new Set(demoQuestions.map((q) => q.url.split('/')[4])).size > 1, 'question links span multiple subreddits');

// --- watchlist ---
const watch = analyze.watchlistMatches(posts, ['prolific waitlist', 'zzz-no-match'], 90, { now: NOW });
assert.strictEqual(watch.length, 2);
assert.ok(watch[0].count > 0, 'waitlist posts matched');
assert.strictEqual(watch[1].count, 0);

// --- ideas ---
const ideas = generateIdeas('Is Swagbucks still worth it?', { site: 'Swagbucks' });
assert.ok(ideas.isQuestion);
assert.ok(ideas.blogTitles.length >= 5 && ideas.youtubeTitles.length >= 4 && ideas.emailSubjects.length >= 3 && ideas.outline.length >= 6);
assert.ok(ideas.blogTitles.every((t) => t.length > 10));
const kwIdeas = generateIdeas('swagbucks review');
assert.ok(!kwIdeas.isQuestion && kwIdeas.blogTitles.length >= 5);

// --- store ---
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bmi-test-'));
store.init(tmp);
assert.deepStrictEqual(store.get('nothing', []), []);
store.set('calendar', [{ id: '1', title: 'test' }]);
assert.strictEqual(store.get('calendar')[0].title, 'test');
assert.strictEqual(store.getSettings().cacheTtlHours, 6, 'default settings');
store.setSettings({ cacheTtlHours: 12 });
assert.strictEqual(store.getSettings().cacheTtlHours, 12, 'settings patch persists');
assert.ok(Array.isArray(store.getSettings().subreddits), 'defaults merge with patch');
fs.rmSync(tmp, { recursive: true, force: true });

// --- opportunity scoring ---
const { scoreOpportunities, isCovered } = require('../lib/opportunity');
const qs = analyze.topQuestions(posts, 90, { now: NOW });
const calendar = [{ title: 'Swagbucks worth it in 2026 — full test', keyword: 'swagbucks worth it' }];
const opps = scoreOpportunities(qs, calendar, {
  [qs[0].title.toLowerCase()]: { difficulty: 20, weakInTop5: 4, checkedAt: NOW }
}, { now: NOW });
assert.strictEqual(opps.length, qs.length);
for (let i = 1; i < opps.length; i++) assert.ok(opps[i - 1].score >= opps[i].score, 'opps sorted by score');
for (const o of opps) {
  assert.ok(o.score >= 0 && o.score <= 100, `score in range: ${o.score}`);
  const sum = o.breakdown.engagementPts + o.breakdown.recencyPts + o.breakdown.coveragePts + o.breakdown.competitionPts;
  assert.strictEqual(o.score, sum, 'score equals breakdown sum');
}
assert.ok(isCovered('Is Swagbucks still worth it or has it gone downhill?', calendar), 'covered topic detected');
assert.ok(!isCovered('How do taxes work for survey income?', calendar), 'uncovered topic not flagged');
const coveredOpp = opps.find((o) => /swagbucks still worth it/i.test(o.title));
assert.ok(coveredOpp.covered && coveredOpp.breakdown.coveragePts === 0, 'covered question gets no coverage bonus');
const checkedOpp = opps.find((o) => o.title.toLowerCase() === qs[0].title.toLowerCase());
assert.ok(checkedOpp.difficulty === 20 && checkedOpp.breakdown.competitionPts === 12, 'SERP-checked question gets competition points');

// --- pain points ---
const { extractPhrases, painSentences } = require('../lib/painpoints');
const comments = [
  'The Prolific waitlist took forever for me. Honestly the waitlist took months.',
  'I waited on the prolific waitlist for three months before getting in.',
  'The waitlist took ages but the surveys pay well once you are in.',
  'Swagbucks banned my account with $80 pending. Total scam behavior, support ghosted me.',
  'Decent app overall, cashed out twice with no issues.'
];
const phrases = extractPhrases(comments, { minCount: 2 });
assert.ok(phrases.length > 0, 'repeated phrases extracted');
assert.ok(phrases.some((p) => p.phrase.includes('waitlist')), 'waitlist complaints surfaced');
assert.ok(phrases.every((p) => p.count >= 2 && p.sample.length > 0));
const complaints = painSentences(comments);
assert.ok(complaints.some((c) => c.includes('banned')), 'negative sentences surfaced');
assert.ok(!complaints.some((c) => c.includes('no issues')), 'positive sentences excluded');

// --- feed parsing ---
const { parseFeed, toFeedUrl } = require('../lib/providers/feeds');
const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>Money Blog</title>
  <item><title><![CDATA[Best Survey Sites &amp; Apps]]></title><link>https://blog.example/post1</link><pubDate>Mon, 01 Jun 2026 10:00:00 GMT</pubDate></item>
  <item><title>Swagbucks Review</title><link>https://blog.example/post2</link><pubDate>Fri, 01 May 2026 10:00:00 GMT</pubDate></item>
</channel></rss>`;
const parsedRss = parseFeed(rss);
assert.strictEqual(parsedRss.title, 'Money Blog');
assert.strictEqual(parsedRss.items.length, 2);
assert.strictEqual(parsedRss.items[0].title, 'Best Survey Sites & Apps');
assert.strictEqual(parsedRss.items[0].link, 'https://blog.example/post1');
assert.ok(parsedRss.items[0].date > 0, 'pubDate parsed');

const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>YT Channel</title>
  <entry><title>I Tested 10 Survey Apps</title><link rel="alternate" href="https://www.youtube.com/watch?v=abc"/><published>2026-06-01T10:00:00+00:00</published></entry>
</feed>`;
const parsedAtom = parseFeed(atom);
assert.strictEqual(parsedAtom.items.length, 1);
assert.strictEqual(parsedAtom.items[0].link, 'https://www.youtube.com/watch?v=abc');
assert.strictEqual(
  toFeedUrl('https://www.youtube.com/channel/UCabc123def456ghi'),
  'https://www.youtube.com/feeds/videos.xml?channel_id=UCabc123def456ghi'
);
assert.strictEqual(toFeedUrl('https://blog.example/feed'), 'https://blog.example/feed');

// --- SERP parsing ---
const { parseResultUrls, classifyDomain } = require('../lib/providers/serp');
const ddgHtml = `
  <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.reddit.com%2Fr%2Fbeermoney%2F&rut=x">Reddit thread</a>
  <a rel="nofollow" class="result__a" href="https://www.nerdwallet.com/article/surveys">NerdWallet</a>
  <a class="result__a" href="https://smallblog.example/swagbucks-review">Small blog</a>`;
const urls = parseResultUrls(ddgHtml);
assert.strictEqual(urls.length, 3);
assert.strictEqual(urls[0], 'https://www.reddit.com/r/beermoney/', 'uddg redirect decoded');
assert.strictEqual(classifyDomain('reddit.com'), 'weak');
assert.strictEqual(classifyDomain('nerdwallet.com'), 'strong');
assert.strictEqual(classifyDomain('smallblog.example'), 'neutral');

console.log('All analyze/store/ideas/opportunity/painpoints/feeds/serp tests passed.');
