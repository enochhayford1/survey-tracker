'use strict';

const { app, BrowserWindow, ipcMain, shell, Notification } = require('electron');
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

  // ---- Alerts ----
  // Scan fresh data for things worth interrupting the user about: watchlist
  // matches, fast-rising posts, and complaint spikes. Deduped via alerts-seen.
  function computeAlerts(posts) {
    const settings = store.getSettings();
    const seen = new Set(store.get('alerts-seen', []) || []);
    const fresh = [];
    const add = (key, type, title, body, url) => {
      if (seen.has(key)) return;
      seen.add(key);
      fresh.push({ id: key, ts: Date.now(), type, title, body, url: url || null });
    };
    for (const w of analyze.watchlistMatches(posts, settings.watchlist || [], 7)) {
      for (const m of w.matches) add(`watch:${w.term}:${m.url}`, 'watchlist', `Watchlist hit: "${w.term}"`, m.title, m.url);
    }
    for (const p of analyze.risingTopics(posts, { hours: 24 })) {
      if (p.velocity >= 25) add(`rising:${p.url}`, 'rising', 'Rising fast — cover it first', `${p.title} (${p.velocity} engagement/hr)`, p.url);
    }
    const week = new Date().toISOString().slice(0, 10).slice(0, 8);
    for (const r of analyze.reputation(posts, 7, allSites())) {
      if (r.negative >= 3 && r.ratio >= 40) {
        add(`rep:${r.id}:${week}`, 'reputation', `Complaint spike: ${r.name}`, `${r.negative} negative of ${r.total} mentions this week (${r.ratio}%)`, r.samples[0]?.url);
      }
    }
    if (fresh.length) {
      store.set('alerts-seen', [...seen].slice(-800));
      const log = [...fresh, ...(store.get('alerts', []) || [])].slice(0, 100);
      store.set('alerts', log);
      if (settings.alertsEnabled && Notification.isSupported()) {
        for (const a of fresh.slice(0, 3)) new Notification({ title: a.title, body: a.body }).show();
      }
    }
    return fresh;
  }

  // ---- Autopilot: background refresh on an interval ----
  let autopilotTimer = null;
  function scheduleAutopilot() {
    clearInterval(autopilotTimer);
    const mins = store.getSettings().autoRefreshMins || 0;
    if (mins >= 5) {
      autopilotTimer = setInterval(async () => {
        try {
          const { posts, source } = await reddit.getPosts({ force: true });
          if (source === 'live') {
            recordSnapshot(posts);
            computeAlerts(posts);
          }
        } catch { /* next tick will retry */ }
      }, mins * 60000);
    }
  }

  // ---- Intel (Reddit-derived) ----
  ipcMain.handle('intel:status', async (_e, { force = false } = {}) => {
    const { posts, fetchedAt, source, error } = await reddit.getPosts({ force });
    if (source === 'live') {
      recordSnapshot(posts);
      computeAlerts(posts);
    }
    return { postCount: posts.length, fetchedAt, source, error: error || null };
  });
  ipcMain.handle('alerts:list', () => store.get('alerts', []) || []);
  ipcMain.handle('alerts:clear', () => { store.set('alerts', []); return true; });
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

  // ---- Rank Tracker ----
  ipcMain.handle('rank:check', async () => {
    const settings = store.getSettings();
    const domain = (settings.myDomain || '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
    if (!domain) throw new Error('Set your website domain in Settings first.');
    const tracks = store.get('ranktracks', []) || [];
    if (!tracks.length) throw new Error('Add at least one keyword to track.');
    const history = store.get('rank-history', {}) || {};
    const today = new Date().toISOString().slice(0, 10);
    const results = [];
    for (const t of tracks) {
      try {
        const serpResult = await serp.checkCompetition(t.keyword);
        const idx = serpResult.results.findIndex((r) => r.host === domain || (r.host || '').endsWith(`.${domain}`));
        const position = idx >= 0 ? idx + 1 : null;
        const entries = (history[t.keyword] || []).filter((e) => e.date !== today);
        entries.push({ date: today, position });
        history[t.keyword] = entries.slice(-60);
        results.push({ keyword: t.keyword, position, topResult: serpResult.results[0]?.host || null, history: history[t.keyword] });
      } catch (err) {
        results.push({ keyword: t.keyword, error: err.message, history: history[t.keyword] || [] });
      }
      await new Promise((r) => setTimeout(r, 1500)); // be polite to the search endpoint
    }
    store.set('rank-history', history);
    return { domain, results };
  });
  ipcMain.handle('rank:history', () => store.get('rank-history', {}) || {});

  // ---- Draft Factory (Message Batches — 50% token cost) ----
  ipcMain.handle('factory:queue', async (_e, { items }) => {
    const settings = store.getSettings();
    const batchId = await ai.queueDraftBatch({ apiKey: settings.aiApiKey, model: settings.aiModel, items });
    store.set('factory-batch', { batchId, createdAt: Date.now(), items: items.map(({ id, topic, contentType }) => ({ id, topic, contentType })) });
    return batchId;
  });
  ipcMain.handle('factory:active', () => store.get('factory-batch', null));
  ipcMain.handle('factory:status', async () => {
    const active = store.get('factory-batch', null);
    if (!active) return null;
    const settings = store.getSettings();
    const status = await ai.draftBatchStatus({ apiKey: settings.aiApiKey, batchId: active.batchId });
    if (status.status !== 'ended') return { ...status, done: false, items: active.items };
    const results = await ai.draftBatchResults({ apiKey: settings.aiApiKey, batchId: active.batchId });
    const drafts = store.get('drafts', []) || [];
    for (const item of active.items) {
      const r = results[item.id];
      drafts.unshift({
        id: `${item.id}-${Date.now()}`,
        topic: item.topic,
        contentType: item.contentType,
        text: r?.text || null,
        error: r?.error || (r ? null : 'missing from batch results'),
        createdAt: Date.now()
      });
    }
    store.set('drafts', drafts.slice(0, 100));
    store.set('factory-batch', null);
    return { ...status, done: true, items: active.items };
  });

  // ---- Intelligence Briefing ----
  ipcMain.handle('ai:briefing', async (e) => {
    const settings = store.getSettings();
    const data = await reddit.getPosts();
    const sites = allSites();
    const digest = {
      generatedAt: new Date().toISOString(),
      dataSource: data.source,
      topQuestions30d: analyze.topQuestions(data.posts, 30, { limit: 12 }).map((q) => ({ q: q.title, score: q.score, comments: q.comments })),
      siteMentions30d: analyze.siteMentions(data.posts, 30, sites).slice(0, 12).map((s) => ({ site: s.name, mentions: s.mentions, prev: s.prevMentions })),
      rising48h: analyze.risingTopics(data.posts).slice(0, 6).map((p) => ({ title: p.title, velocity: p.velocity })),
      complaints30d: analyze.reputation(data.posts, 30, sites).slice(0, 6).map((r) => ({ site: r.name, negative: r.negative, total: r.total, examples: r.samples.map((s) => s.title) })),
      watchlistHits: analyze.watchlistMatches(data.posts, settings.watchlist || [], 30)
        .filter((w) => w.count > 0)
        .map((w) => ({ term: w.term, count: w.count, top: w.matches[0]?.title }))
    };
    return ai.generateBriefing({
      apiKey: settings.aiApiKey,
      model: settings.aiModel,
      digest,
      onText: (t) => { if (!e.sender.isDestroyed()) e.sender.send('ai:briefing:chunk', t); }
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
  const COLLECTIONS = new Set(['calendar', 'links', 'revenue', 'competitors', 'ranktracks', 'drafts']);
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
  ipcMain.handle('settings:set', (_e, patch) => {
    const result = store.setSettings(patch);
    scheduleAutopilot();
    return result;
  });

  // ---- Misc ----
  ipcMain.handle('app:openExternal', (_e, { url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  });

  scheduleAutopilot();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
