'use strict';

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');

const store = require('./lib/store');
const reddit = require('./lib/providers/reddit');
const autocomplete = require('./lib/providers/autocomplete');
const serp = require('./lib/providers/serp');
const comments = require('./lib/providers/comments');
const feeds = require('./lib/providers/feeds');
const ai = require('./lib/providers/ai');
const { getVolumeProvider, listVolumeProviders } = require('./lib/providers');
const analyze = require('./lib/analyze');
const painpoints = require('./lib/painpoints');
const { scoreOpportunities } = require('./lib/opportunity');
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

  // Record a daily snapshot of 30-day site mentions so Top Sites can show
  // momentum over time. One entry per day, capped at 120 days.
  function recordSnapshot(posts) {
    const today = new Date().toISOString().slice(0, 10);
    const counts = {};
    for (const s of analyze.siteMentions(posts, 30, allSites())) counts[s.id] = s.mentions;
    const history = (store.get('history', []) || []).filter((h) => h.date !== today);
    history.push({ date: today, counts });
    store.set('history', history.slice(-120));
  }

  // ---- Intel (Reddit-derived) ----
  ipcMain.handle('intel:status', async (_e, { force = false } = {}) => {
    const { posts, fetchedAt, source, error } = await reddit.getPosts({ force });
    if (source === 'live') recordSnapshot(posts);
    return { postCount: posts.length, fetchedAt, source, error: error || null };
  });
  ipcMain.handle('intel:siteHistory', () => store.get('history', []) || []);
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

  // ---- Opportunity Engine ----
  ipcMain.handle('opps:list', async (_e, { days }) => {
    const data = await reddit.getPosts();
    const questions = analyze.topQuestions(data.posts, days, { limit: 40 });
    const calendar = store.get('calendar', []) || [];
    const serpCache = store.get('serp-cache', {}) || {};
    return { source: data.source, items: scoreOpportunities(questions, calendar, serpCache, { windowDays: days }) };
  });

  // ---- SERP competition checker (cached 7 days per keyword) ----
  ipcMain.handle('serp:check', async (_e, { keyword, force = false }) => {
    const cache = store.get('serp-cache', {}) || {};
    const key = keyword.toLowerCase();
    if (!force && cache[key] && Date.now() - cache[key].checkedAt < 7 * 86400000) return cache[key];
    const result = await serp.checkCompetition(keyword);
    cache[key] = result;
    store.set('serp-cache', cache);
    return result;
  });

  // ---- Pain Point Miner ----
  ipcMain.handle('pain:mine', async (_e, { siteId }) => {
    const data = await reddit.getPosts();
    if (data.source === 'demo') {
      throw new Error('Pain point mining needs live Reddit data — demo posts have no real comment threads.');
    }
    const site = allSites().find((s) => s.id === siteId);
    if (!site) throw new Error(`Unknown site: ${siteId}`);
    const re = new RegExp(`\\b(${site.aliases.map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'i');
    const threads = data.posts
      .filter((p) => re.test(`${p.title} ${p.selftext || ''}`))
      .sort((a, b) => analyze.engagement(b) - analyze.engagement(a))
      .slice(0, 5);
    if (!threads.length) throw new Error(`No recent threads mention ${site.name}.`);
    const results = await Promise.allSettled(threads.map((t) => comments.fetchComments(t.permalink)));
    const texts = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    if (!texts.length) throw new Error('Could not fetch any comments — check your connection.');
    return {
      site: site.name,
      threads: threads.map((t) => ({ title: t.title, url: `https://www.reddit.com${t.permalink}`, comments: t.num_comments })),
      commentCount: texts.length,
      phrases: painpoints.extractPhrases(texts),
      complaints: painpoints.painSentences(texts)
    };
  });

  // ---- Competitor feeds ----
  ipcMain.handle('feeds:fetchAll', async () => {
    const competitors = store.get('competitors', []) || [];
    const results = await Promise.allSettled(competitors.map((c) => feeds.fetchFeed(c.url)));
    const monthAgo = Date.now() - 30 * 86400000;
    return competitors.map((c, i) => {
      const r = results[i];
      if (r.status === 'rejected') return { ...c, error: r.reason.message, items: [], perMonth: 0 };
      const items = r.value.items.slice(0, 10);
      return { ...c, feedTitle: r.value.title, items, perMonth: r.value.items.filter((it) => it.date && it.date >= monthAgo).length, error: null };
    });
  });

  // ---- AI draft writer ----
  ipcMain.handle('ai:draft', async (e, { topic, site, contentType, outline }) => {
    const settings = store.getSettings();
    return ai.draftContent({
      apiKey: settings.aiApiKey,
      model: settings.aiModel,
      topic,
      site,
      contentType,
      outline,
      onText: (t) => { if (!e.sender.isDestroyed()) e.sender.send('ai:draft:chunk', t); }
    });
  });
  ipcMain.handle('ai:models', () => ai.MODELS);

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
  const COLLECTIONS = new Set(['calendar', 'links', 'revenue', 'competitors']);
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
