'use strict';

const https = require('https');
const { URL } = require('url');

// A browser-grade User-Agent matters: Reddit (and others) block obvious
// non-browser clients. Combined with Electron's Chromium network stack below,
// requests are indistinguishable from a normal browser.
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Inside Electron's main process, prefer net.fetch — it uses Chromium's
// network stack (HTTP/2, browser TLS fingerprint, proxy settings), which
// passes bot checks that flag Node's raw https module. Falls back to Node
// https everywhere else (e.g. the plain-node test suite).
let electronNet = null;
try {
  const electron = require('electron');
  if (electron && electron.net && process.type === 'browser') electronNet = electron.net;
} catch { /* not running under Electron */ }

function nodeRequest(urlStr, { method = 'GET', headers = {}, body = null, timeoutMs = 15000, redirects = 3 } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const req = https.request(
      url,
      {
        method,
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json,text/html,text/plain,*/*', ...headers }
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0 && method === 'GET') {
          res.resume();
          resolve(nodeRequest(new URL(res.headers.location, url).toString(), { method, headers, body, timeoutMs, redirects: redirects - 1 }));
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode} for ${url.hostname}${url.pathname}`));
          return;
        }
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve(data));
      }
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Timeout after ${timeoutMs}ms for ${url.hostname}`)));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function chromiumRequest(urlStr, { method = 'GET', headers = {}, body = null, timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await electronNet.fetch(urlStr, {
      method,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json,text/html,text/plain,*/*', ...headers },
      body: body || undefined,
      signal: controller.signal
    });
    if (!res.ok) {
      const url = new URL(urlStr);
      throw new Error(`HTTP ${res.status} for ${url.hostname}${url.pathname}`);
    }
    return await res.text();
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout after ${timeoutMs}ms for ${new URL(urlStr).hostname}`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * HTTPS request returning the body as a string. Under Electron, tries
 * Chromium's stack first (passes bot checks Node's https fails), then falls
 * back to Node https (handles environments where Chromium rejects a local
 * proxy's certs).
 */
async function httpRequest(urlStr, opts = {}) {
  if (!electronNet) return nodeRequest(urlStr, opts);
  try {
    return await chromiumRequest(urlStr, opts);
  } catch (chromiumErr) {
    try {
      return await nodeRequest(urlStr, opts);
    } catch {
      throw chromiumErr;
    }
  }
}

async function httpGet(urlStr, opts = {}) {
  return httpRequest(urlStr, { ...opts, method: 'GET' });
}

async function getJson(urlStr, opts) {
  return JSON.parse(await httpGet(urlStr, opts));
}

module.exports = { httpRequest, httpGet, getJson, USER_AGENT };
