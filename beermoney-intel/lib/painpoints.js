'use strict';

const { NEGATIVE_TERMS } = require('./analyze');

const STOPWORDS = new Set(`a an and are as at be been but by can could did do does for from had has have he her his how i if in is it its just me my no not of on or our out she so than that the their them then there these they this to up us was we were what when which who will with would you your i'm it's don't dont didn't im ive i've really also even still very much get got like one`.split(/\s+/));

function sentences(text) {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 15 && s.length <= 280);
}

function words(text) {
  return text.toLowerCase().replace(/[^a-z0-9'$ ]/g, ' ').split(/\s+/).filter(Boolean);
}

function isContentGram(gram) {
  // At least one non-stopword, no gram made of tiny fragments.
  return gram.some((w) => !STOPWORDS.has(w) && w.length > 2) && gram.join(' ').length >= 7;
}

/**
 * Extract the most repeated 2-3 word phrases across a set of comments.
 * Counted once per comment so a single rant doesn't dominate. Returns
 * [{ phrase, count, sample }] sorted by count.
 */
function extractPhrases(texts, { minCount = 2, maxPhrases = 15 } = {}) {
  const counts = new Map();
  for (const text of texts) {
    const seenInText = new Set();
    for (const sentence of sentences(text)) {
      const ws = words(sentence);
      for (let n = 2; n <= 3; n++) {
        for (let i = 0; i + n <= ws.length; i++) {
          const gram = ws.slice(i, i + n);
          if (!isContentGram(gram)) continue;
          const key = gram.join(' ');
          if (seenInText.has(key)) continue;
          seenInText.add(key);
          const entry = counts.get(key) || { phrase: key, count: 0, sample: sentence };
          entry.count++;
          counts.set(key, entry);
        }
      }
    }
  }
  const ranked = [...counts.values()]
    .filter((e) => e.count >= minCount)
    .sort((a, b) => b.count - a.count || b.phrase.length - a.phrase.length);
  // Drop shorter grams subsumed by a higher-ranked longer gram.
  const kept = [];
  for (const e of ranked) {
    if (kept.length >= maxPhrases) break;
    if (kept.some((k) => k.phrase.includes(e.phrase) && k.count >= e.count)) continue;
    kept.push(e);
  }
  return kept;
}

/** Sentences expressing complaints/problems — raw material for FAQ sections and "watch out for" content. */
function painSentences(texts, { max = 12 } = {}) {
  const out = [];
  const seen = new Set();
  for (const text of texts) {
    for (const s of sentences(text)) {
      const lower = s.toLowerCase();
      if (!NEGATIVE_TERMS.some((t) => lower.includes(t))) continue;
      const key = lower.slice(0, 60);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
      if (out.length >= max) return out;
    }
  }
  return out;
}

module.exports = { extractPhrases, painSentences, sentences };
