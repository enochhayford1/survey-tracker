'use strict';

const { httpGet } = require('../fetch');

// SERP competition check via DuckDuckGo's HTML endpoint (no API key).
// Classifies the domains that rank for a keyword: lots of forum/UGC results
// means a small affiliate site can realistically outrank them.

const WEAK_DOMAINS = [
  'reddit.com', 'quora.com', 'medium.com', 'blogspot.com', 'wordpress.com',
  'youtube.com', 'pinterest.com', 'facebook.com', 'twitter.com', 'x.com',
  'tiktok.com', 'tumblr.com', 'answers.com'
];

const STRONG_DOMAINS = [
  'nerdwallet.com', 'thepennyhoarder.com', 'forbes.com', 'businessinsider.com',
  'bankrate.com', 'cnbc.com', 'nytimes.com', 'usatoday.com', 'cnet.com',
  'sidehustlenation.com', 'dollarsprout.com', 'wellkeptwallet.com',
  'moneypantry.com', 'thecollegeinvestor.com', 'millennialmoney.com',
  'gobankingrates.com', 'investopedia.com', 'time.com', 'wikipedia.org',
  'surveypolice.com', 'trustpilot.com'
];

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function classifyDomain(host) {
  if (!host) return 'neutral';
  if (WEAK_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))) return 'weak';
  if (STRONG_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))) return 'strong';
  return 'neutral';
}

/** Extract result URLs from DuckDuckGo HTML (links may be wrapped in /l/?uddg= redirects). */
function parseResultUrls(html) {
  const urls = [];
  const re = /class="result__a"[^>]*href="([^"]+)"/g;
  let m;
  while ((m = re.exec(html)) && urls.length < 10) {
    let href = m[1].replace(/&amp;/g, '&');
    if (href.startsWith('//')) href = `https:${href}`;
    const uddg = /[?&]uddg=([^&]+)/.exec(href);
    if (uddg) href = decodeURIComponent(uddg[1]);
    if (/^https?:\/\//.test(href)) urls.push(href);
  }
  return urls;
}

const CLASS_POINTS = { strong: 10, neutral: 6, weak: 2 };

/**
 * Difficulty 0-100: average competitiveness of the top results.
 * Low difficulty + weak domains in the top 5 = a keyword you can win.
 */
async function checkCompetition(keyword) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(keyword)}`;
  const html = await httpGet(url, { timeoutMs: 12000 });
  const results = parseResultUrls(html).map((u) => {
    const host = hostOf(u);
    return { url: u, host, class: classifyDomain(host) };
  });
  if (!results.length) throw new Error('No results parsed — DuckDuckGo may be rate-limiting; try again later.');
  const difficulty = Math.round(
    (results.reduce((s, r) => s + CLASS_POINTS[r.class], 0) / results.length) * 10
  );
  const weakInTop5 = results.slice(0, 5).filter((r) => r.class === 'weak').length;
  return { keyword, difficulty, weakInTop5, results, checkedAt: Date.now() };
}

module.exports = { checkCompetition, parseResultUrls, classifyDomain };
