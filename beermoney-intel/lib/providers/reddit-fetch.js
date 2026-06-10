'use strict';

const { httpRequest, getJson } = require('../fetch');
const store = require('../store');

// Strategy for fetching Reddit JSON, most reliable first:
//  1. Official OAuth API (oauth.reddit.com) when the user has pasted free
//     "script app" credentials in Settings — sanctioned access, never blocked.
//  2. Public JSON mirrors (www/old/api.reddit.com) via Chromium's stack.
//  3. A hidden BrowserWindow loading the URL as a real page — full browser
//     context (cookies, JS challenges) for machines where 2 gets a 403.

const HOSTS = ['https://www.reddit.com', 'https://old.reddit.com', 'https://api.reddit.com'];
const OAUTH_UA = 'windows:beermoney-intel:v1.2 (affiliate content research tool)';
let workingHost = null;
let oauthToken = null; // { value, expiresAt }

async function getOAuthToken(clientId, clientSecret, { force = false } = {}) {
  if (!force && oauthToken && Date.now() < oauthToken.expiresAt - 60000) return oauthToken.value;
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  let body;
  try {
    body = await httpRequest('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': OAUTH_UA
      },
      body: 'grant_type=client_credentials'
    });
  } catch (err) {
    throw new Error(`Reddit OAuth token request failed (${err.message}) — check the client ID/secret in Settings.`);
  }
  const json = JSON.parse(body);
  if (!json.access_token) throw new Error(`Reddit OAuth rejected the credentials: ${body.slice(0, 200)}`);
  oauthToken = { value: json.access_token, expiresAt: Date.now() + (json.expires_in || 3600) * 1000 };
  return oauthToken.value;
}

async function oauthGet(path, clientId, clientSecret, retried = false) {
  const token = await getOAuthToken(clientId, clientSecret);
  // oauth.reddit.com serves the same paths without the .json suffix.
  const oauthPath = path.replace(/\.json(?=\?|$)/, '');
  try {
    return JSON.parse(await httpRequest(`https://oauth.reddit.com${oauthPath}`, {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': OAUTH_UA }
    }));
  } catch (err) {
    if (!retried && /HTTP 401/.test(err.message)) {
      await getOAuthToken(clientId, clientSecret, { force: true });
      return oauthGet(path, clientId, clientSecret, true);
    }
    throw err;
  }
}

/**
 * Load a URL in an invisible BrowserWindow and return the page's text.
 * A real page load runs with full browser context, so it can pass JS-based
 * bot checks that block plain HTTP clients. JSON endpoints render their
 * payload as the document body text.
 */
async function windowGetJson(url) {
  let BrowserWindow;
  try {
    ({ BrowserWindow } = require('electron'));
  } catch {
    throw new Error('hidden-window fetch unavailable outside Electron');
  }
  const win = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, nodeIntegration: false, images: false }
  });
  try {
    await win.loadURL(url, { userAgent: undefined });
    for (let attempt = 0; attempt < 3; attempt++) {
      const text = await win.webContents.executeJavaScript('document.body ? document.body.innerText : ""', true);
      try {
        return JSON.parse(text);
      } catch {
        // Possibly an interstitial bot-check page that resolves itself; wait and re-read.
        await new Promise((r) => setTimeout(r, 2500));
      }
    }
    throw new Error(`page did not return JSON for ${new URL(url).pathname}`);
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

/**
 * Fetch a Reddit JSON path (e.g. "/r/beermoney/new.json?limit=100") using the
 * best available strategy.
 */
async function getRedditJson(path) {
  const settings = store.getSettings();

  if (settings.redditClientId && settings.redditClientSecret) {
    return oauthGet(path, settings.redditClientId, settings.redditClientSecret);
  }

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

  try {
    return await windowGetJson(`https://www.reddit.com${path}`);
  } catch (windowErr) {
    const hint = /403/.test(lastError?.message || '')
      ? ' — Reddit is blocking anonymous access from this machine. Fix: add free Reddit API credentials in Settings (takes 2 minutes).'
      : '';
    throw new Error(`${lastError?.message || windowErr.message}${hint}`);
  }
}

module.exports = { getRedditJson };
