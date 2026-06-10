'use strict';

const { getJson } = require('../fetch');

const QUESTION_PREFIXES = ['how', 'what', 'is', 'can', 'why', 'does', 'best', 'which'];
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('');

async function suggest(query) {
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}`;
  const json = await getJson(url, { timeoutMs: 8000 });
  return Array.isArray(json?.[1]) ? json[1] : [];
}

/**
 * Fan out a seed keyword through Google Autocomplete:
 *  - "<seed>" itself
 *  - "<prefix> <seed>" for question prefixes
 *  - "<seed> <letter>" for a..z (capped by `depth`)
 * Returns { suggestions: [{ text, isQuestion }], errors }.
 */
async function explore(seed, { depth = 12 } = {}) {
  const queries = [
    seed,
    ...QUESTION_PREFIXES.map((p) => `${p} ${seed}`),
    ...ALPHABET.slice(0, depth).map((l) => `${seed} ${l}`)
  ];
  const seen = new Set();
  const suggestions = [];
  let errors = 0;
  // Sequential with small batches to stay polite to the endpoint.
  const BATCH = 5;
  for (let i = 0; i < queries.length; i += BATCH) {
    const batch = queries.slice(i, i + BATCH);
    const results = await Promise.allSettled(batch.map((q) => suggest(q)));
    for (const r of results) {
      if (r.status === 'rejected') { errors++; continue; }
      for (const text of r.value) {
        const key = text.toLowerCase().trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        suggestions.push({
          text,
          isQuestion: /^(how|what|is|are|can|why|does|do|which|when|where|should)\b/i.test(text)
        });
      }
    }
  }
  return { suggestions, errors, queried: queries.length };
}

module.exports = { suggest, explore };
