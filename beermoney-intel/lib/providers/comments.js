'use strict';

const { getRedditJson } = require('./reddit-fetch');

/** Recursively collect comment bodies from a Reddit comment listing. */
function collectBodies(children, out, cap) {
  for (const child of children || []) {
    if (out.length >= cap) return;
    if (child.kind !== 't1' || !child.data) continue;
    const body = (child.data.body || '').trim();
    if (body && body !== '[deleted]' && body !== '[removed]') out.push(body.slice(0, 1500));
    if (child.data.replies?.data?.children) {
      collectBodies(child.data.replies.data.children, out, cap);
    }
  }
}

/** Fetch comment text for a Reddit post permalink (e.g. "/r/beermoney/comments/abc/title/"). */
async function fetchComments(permalink, { cap = 200 } = {}) {
  const clean = permalink.replace(/\/+$/, '');
  const json = await getRedditJson(`${clean}.json?raw_json=1&limit=200&depth=4`);
  const out = [];
  collectBodies(json?.[1]?.data?.children, out, cap);
  return out;
}

module.exports = { fetchComments, collectBodies };
