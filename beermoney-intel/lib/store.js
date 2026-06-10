'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Tiny JSON-file persistence layer. One file per collection, stored under
 * the directory passed to init() (Electron's userData dir in production,
 * a temp dir in tests).
 */
let baseDir = null;

function init(dir) {
  baseDir = dir;
  fs.mkdirSync(baseDir, { recursive: true });
}

function fileFor(collection) {
  if (!baseDir) throw new Error('store.init(dir) must be called first');
  if (!/^[a-z0-9_-]+$/i.test(collection)) throw new Error(`Invalid collection name: ${collection}`);
  return path.join(baseDir, `${collection}.json`);
}

function get(collection, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(fileFor(collection), 'utf8'));
  } catch {
    return fallback;
  }
}

function set(collection, value) {
  const file = fileFor(collection);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
  return value;
}

const DEFAULT_SETTINGS = {
  subreddits: ['beermoney', 'SwagBucks', 'ProlificAc', 'WorkOnline'],
  cacheTtlHours: 6,
  volumeProvider: 'none', // 'none' | future paid providers, see lib/providers/index.js
  volumeApiKey: '',
  watchlist: ['prolific waitlist', 'swagbucks payout', 'highest paying surveys'],
  aiApiKey: '',
  aiModel: 'claude-opus-4-8',
  myDomain: '',
  autoRefreshMins: 0, // 0 = autopilot off; minimum 5 when on
  alertsEnabled: true
};

function getSettings() {
  return { ...DEFAULT_SETTINGS, ...(get('settings', {}) || {}) };
}

function setSettings(patch) {
  return set('settings', { ...getSettings(), ...patch });
}

module.exports = { init, get, set, getSettings, setSettings, DEFAULT_SETTINGS };
