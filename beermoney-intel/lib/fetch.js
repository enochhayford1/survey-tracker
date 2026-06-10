'use strict';

const https = require('https');
const { URL } = require('url');

const USER_AGENT = 'windows:beermoney-intel:v1.0.0 (affiliate content research tool)';

/**
 * Minimal HTTPS GET returning the response body as a string.
 * Follows up to 3 redirects, times out after `timeoutMs`.
 */
function httpGet(urlStr, { timeoutMs = 15000, redirects = 3 } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const req = https.get(
      url,
      { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json,text/plain,*/*' } },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
          res.resume();
          resolve(httpGet(new URL(res.headers.location, url).toString(), { timeoutMs, redirects: redirects - 1 }));
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode} for ${url.hostname}${url.pathname}`));
          return;
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve(body));
      }
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Timeout after ${timeoutMs}ms for ${url.hostname}`)));
    req.on('error', reject);
  });
}

async function getJson(urlStr, opts) {
  return JSON.parse(await httpGet(urlStr, opts));
}

module.exports = { httpGet, getJson, USER_AGENT };
