'use strict';

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');

const store = require('./lib/store');
const reddit = require('./lib/providers/reddit');
const autocomplete = require('./lib/providers/autocomplete');
const { getVolumeProvider, listVolumeProviders } = require('./lib/providers');
const analyze = require('./lib/analyze');
const { SEED_SITES } = require('./lib/sites');
const { generateIdeas } = require('./lib/ideas');

function allSites() {
  const custom = store.get('custom-sites', []) || [];
  const overrides = store.get('site-overrides', {}) || {};
  return [...SEED_SITES, ...custom].map((s) => ({ ...s, ...(overrides[s.id] || {}) }));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#0f1115',
    title: 'Beermoney Intel',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
}

app.whenReady().then(() => {
  store.init(path.join(app.getPath('userData'), 'data'));

  // ---- Intel (Reddit-derived) ----
  ipcMain.handle('intel:status', async (_e, { force = false } = {}) => {
    const { posts, fetchedAt, source, error } = await reddit.getPosts({ force });
    return { postCount: posts.length, fetchedAt, source, error: error || null };
  });
  ipcMain.handle('intel:topQuestions', async (_e, { days }) => {
    const data = await reddit.getPosts();
    return { source: data.source, items: analyze.topQuestions(data.posts, days) };
  });
  ipcMain.handle('intel:topSites', async (_e, { days }) => {
    const data = await reddit.getPosts();
    return { source: data.source, items: analyze.siteMentions(data.posts, days, allSites()) };
  });
  ipcMain.handle('intel:rising', async () => {
    const data = await reddit.getPosts();
    return { source: data.source, items: analyze.risingTopics(data.posts) };
  });
  ipcMain.handle('intel:reputation', async (_e, { days }) => {
    const data = await reddit.getPosts();
    return { source: data.source, items: analyze.reputation(data.posts, days, allSites()) };
  });
  ipcMain.handle('intel:watchlist', async (_e, { days }) => {
    const data = await reddit.getPosts();
    const terms = store.getSettings().watchlist || [];
    return { source: data.source, items: analyze.watchlistMatches(data.posts, terms, days) };
  });

  // ---- Keyword Explorer ----
  ipcMain.handle('keywords:explore', async (_e, { seed }) => {
    const result = await autocomplete.explore(seed);
    const settings = store.getSettings();
    const provider = getVolumeProvider(settings.volumeProvider);
    try {
      const volumes = await provider.getVolumes(result.suggestions.map((s) => s.text), settings.volumeApiKey);
      const byKeyword = new Map(volumes.map((v) => [v.keyword, v]));
      result.suggestions = result.suggestions.map((s) => ({ ...s, ...(byKeyword.get(s.text) || {}) }));
    } catch { /* volume annotation is best-effort */ }
    return result;
  });
  ipcMain.handle('keywords:providers', () => listVolumeProviders());

  // ---- Ideas ----
  ipcMain.handle('ideas:generate', (_e, { topic, site }) => generateIdeas(topic, { site }));

  // ---- Sites ----
  ipcMain.handle('sites:list', () => allSites());
  ipcMain.handle('sites:addCustom', (_e, site) => {
    const custom = store.get('custom-sites', []) || [];
    const id = `custom-${Date.now()}`;
    custom.push({ ...site, id, aliases: site.aliases?.length ? site.aliases : [site.name.toLowerCase()] });
    store.set('custom-sites', custom);
    return id;
  });
  ipcMain.handle('sites:update', (_e, { id, patch }) => {
    const custom = store.get('custom-sites', []) || [];
    const idx = custom.findIndex((s) => s.id === id);
    if (idx >= 0) {
      custom[idx] = { ...custom[idx], ...patch };
      store.set('custom-sites', custom);
    } else {
      const overrides = store.get('site-overrides', {}) || {};
      overrides[id] = { ...(overrides[id] || {}), ...patch };
      store.set('site-overrides', overrides);
    }
    return true;
  });
  ipcMain.handle('sites:deleteCustom', (_e, { id }) => {
    const custom = (store.get('custom-sites', []) || []).filter((s) => s.id !== id);
    store.set('custom-sites', custom);
    return true;
  });

  // ---- Generic collections (calendar, links, revenue) ----
  const COLLECTIONS = new Set(['calendar', 'links', 'revenue']);
  ipcMain.handle('collection:get', (_e, { name }) => {
    if (!COLLECTIONS.has(name)) throw new Error(`Unknown collection: ${name}`);
    return store.get(name, []) || [];
  });
  ipcMain.handle('collection:set', (_e, { name, items }) => {
    if (!COLLECTIONS.has(name)) throw new Error(`Unknown collection: ${name}`);
    store.set(name, items);
    return true;
  });

  // ---- Settings ----
  ipcMain.handle('settings:get', () => store.getSettings());
  ipcMain.handle('settings:set', (_e, patch) => store.setSettings(patch));

  // ---- Misc ----
  ipcMain.handle('app:openExternal', (_e, { url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
