'use strict';

const STOPWORDS = new Set('a an and are as at be but by can do does for from how i in is it of on or the to what which who why with you your has have 2024 2025 2026'.split(/\s+/));

function contentTokens(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
  );
}

/**
 * True if a planner item already targets (roughly) the same topic — either
 * its target keyword is fully contained in the question, or the question and
 * item titles overlap heavily.
 */
function isCovered(questionTitle, calendarItems) {
  const qTokens = contentTokens(questionTitle);
  if (!qTokens.size) return false;
  return calendarItems.some((item) => {
    const kwTokens = contentTokens(item.keyword);
    if (kwTokens.size >= 2 && [...kwTokens].every((t) => qTokens.has(t))) return true;
    const iTokens = contentTokens(`${item.title || ''} ${item.keyword || ''}`);
    if (!iTokens.size) return false;
    let shared = 0;
    for (const t of qTokens) if (iTokens.has(t)) shared++;
    return shared / Math.min(qTokens.size, iTokens.size) >= 0.6;
  });
}

/**
 * Score content opportunities 0-100 from four signals:
 *  - engagement (0-50): how much the community cares, log-scaled
 *  - recency    (0-20): fresher questions rank while interest is hot
 *  - coverage   (0-15): bonus if you haven't covered it in the planner yet
 *  - competition(0-15): bonus for weak SERPs (only when checked; see serp.js)
 */
function scoreOpportunities(questions, calendar, serpCache, { windowDays = 90, now = Date.now() } = {}) {
  const maxEngagement = Math.max(1, ...questions.map((q) => q.engagement));
  return questions
    .map((q) => {
      const engagementPts = Math.round(50 * (Math.log1p(q.engagement) / Math.log1p(maxEngagement)));
      const ageDays = Math.max(0, (now - q.createdUtc * 1000) / 86400000);
      const recencyPts = Math.round(20 * Math.max(0, 1 - ageDays / windowDays));
      const covered = isCovered(q.title, calendar);
      const coveragePts = covered ? 0 : 15;
      const serp = serpCache?.[q.title.toLowerCase()] || null;
      const competitionPts = serp ? Math.round(15 * (1 - serp.difficulty / 100)) : 0;
      return {
        ...q,
        covered,
        difficulty: serp ? serp.difficulty : null,
        weakInTop5: serp ? serp.weakInTop5 : null,
        breakdown: { engagementPts, recencyPts, coveragePts, competitionPts },
        score: engagementPts + recencyPts + coveragePts + competitionPts
      };
    })
    .sort((a, b) => b.score - a.score);
}

module.exports = { scoreOpportunities, isCovered, contentTokens };
