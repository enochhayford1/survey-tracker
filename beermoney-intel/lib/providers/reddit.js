'use strict';

const { getJson } = require('../fetch');
const store = require('../store');

const MAX_PAGES_PER_SUB = 8; // 8 x 100 posts covers ~90 days for these subs
const WINDOW_DAYS = 92;

// Reddit sometimes blocks one mirror while another still serves public JSON.
// Remember which host worked so subsequent pages don't re-probe.
const HOSTS = ['https://www.reddit.com', 'https://old.reddit.com', 'https://api.reddit.com'];
let workingHost = null;

async function getRedditJson(path) {
  const hosts = workingHost ? [workingHost, ...HOSTS.filter((h) => h !== workingHost)] : HOSTS;
  let lastError;
  for (const host of hosts) {
    try {
      const json = await getJson(`${host}${path}`);
      workingHost = host;
      return json;
    } catch (err) {
      lastError = err;
      workingHost = null;
    }
  }
  throw lastError;
}

function pickFields(child) {
  const d = child.data;
  return {
    id: d.id,
    title: d.title || '',
    selftext: (d.selftext || '').slice(0, 2000),
    score: d.score || 0,
    num_comments: d.num_comments || 0,
    created_utc: d.created_utc,
    subreddit: d.subreddit,
    permalink: d.permalink
  };
}

async function fetchSubreddit(sub, { now = Date.now() } = {}) {
  const cutoff = now / 1000 - WINDOW_DAYS * 86400;
  const posts = [];
  let after = '';
  for (let page = 0; page < MAX_PAGES_PER_SUB; page++) {
    const path = `/r/${encodeURIComponent(sub)}/new.json?limit=100&raw_json=1${after ? `&after=${after}` : ''}`;
    const json = await getRedditJson(path);
    const children = json?.data?.children || [];
    if (!children.length) break;
    for (const child of children) posts.push(pickFields(child));
    const oldest = children[children.length - 1].data.created_utc;
    after = json.data.after;
    if (!after || oldest < cutoff) break;
  }
  return posts.filter((p) => p.created_utc >= cutoff);
}

/**
 * Returns { posts, fetchedAt, source } where source is 'live' | 'cache' |
 * 'stale-cache' | 'demo'. Caches to the store; falls back to stale cache and
 * then to the bundled demo dataset when the network is unavailable.
 */
async function getPosts({ force = false } = {}) {
  const settings = store.getSettings();
  const cache = store.get('reddit-cache');
  const ttlMs = (settings.cacheTtlHours || 6) * 3600000;

  if (!force && cache && Date.now() - cache.fetchedAt < ttlMs) {
    return { posts: cache.posts, fetchedAt: cache.fetchedAt, source: 'cache' };
  }

  try {
    // One blocked/misspelled subreddit shouldn't sink the whole refresh.
    const results = await Promise.allSettled(settings.subreddits.map((sub) => fetchSubreddit(sub)));
    const posts = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    const failures = results
      .map((r, i) => (r.status === 'rejected' ? `r/${settings.subreddits[i]}: ${r.reason.message}` : null))
      .filter(Boolean);
    if (!posts.length) throw new Error(failures.join(' | ') || 'No posts returned');
    const fetchedAt = Date.now();
    store.set('reddit-cache', { fetchedAt, posts });
    return { posts, fetchedAt, source: 'live', error: failures.length ? `Partial fetch — ${failures.join(' | ')}` : undefined };
  } catch (err) {
    if (cache) {
      return { posts: cache.posts, fetchedAt: cache.fetchedAt, source: 'stale-cache', error: err.message };
    }
    const { buildSamplePosts } = require('../sample-data');
    return { posts: buildSamplePosts(), fetchedAt: null, source: 'demo', error: err.message };
  }
}

module.exports = { getPosts, fetchSubreddit };
