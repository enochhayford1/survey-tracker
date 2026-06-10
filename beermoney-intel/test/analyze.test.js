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

console.log('All analyze/store/ideas tests passed.');
