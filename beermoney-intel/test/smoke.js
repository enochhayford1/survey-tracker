'use strict';

// Boots the real app window offscreen, waits for the dashboard to render,
// captures a screenshot, and fails on any renderer console error.
// Run: xvfb-run -a node_modules/.bin/electron --no-sandbox test/smoke.js

const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';

const errors = [];

app.whenReady().then(async () => {
  // Reuse the production main-process wiring by requiring main.js handlers
  // would double-register; instead replicate the boot minimally.
  const store = require('../lib/store');
  store.init(path.join(app.getPath('userData'), 'smoke-data'));

  // Register the same IPC handlers as production by loading main.js is not
  // possible (it owns app.whenReady), so spawn the window against the same
  // preload and patch handlers in.
  const { ipcMain, shell } = require('electron');
  const reddit = require('../lib/providers/reddit');
  const analyze = require('../lib/analyze');
  const { SEED_SITES } = require('../lib/sites');
  const { generateIdeas } = require('../lib/ideas');
  const { listVolumeProviders } = require('../lib/providers');

  ipcMain.handle('intel:status', async (_e, { force = false } = {}) => {
    const { posts, fetchedAt, source, error } = await reddit.getPosts({ force });
    return { postCount: posts.length, fetchedAt, source, error: error || null };
  });
  ipcMain.handle('intel:topQuestions', async (_e, { days }) => {
    const d = await reddit.getPosts();
    return { source: d.source, items: analyze.topQuestions(d.posts, days) };
  });
  ipcMain.handle('intel:topSites', async (_e, { days }) => {
    const d = await reddit.getPosts();
    return { source: d.source, items: analyze.siteMentions(d.posts, days, SEED_SITES) };
  });
  ipcMain.handle('intel:rising', async () => {
    const d = await reddit.getPosts();
    return { source: d.source, items: analyze.risingTopics(d.posts) };
  });
  ipcMain.handle('intel:reputation', async (_e, { days }) => {
    const d = await reddit.getPosts();
    return { source: d.source, items: analyze.reputation(d.posts, days, SEED_SITES) };
  });
  ipcMain.handle('intel:watchlist', async (_e, { days }) => {
    const d = await reddit.getPosts();
    return { source: d.source, items: analyze.watchlistMatches(d.posts, store.getSettings().watchlist, days) };
  });
  ipcMain.handle('keywords:providers', () => listVolumeProviders());
  ipcMain.handle('ideas:generate', (_e, { topic, site }) => generateIdeas(topic, { site }));
  ipcMain.handle('sites:list', () => SEED_SITES);
  ipcMain.handle('collection:get', () => []);
  ipcMain.handle('collection:set', () => true);
  ipcMain.handle('settings:get', () => store.getSettings());
  ipcMain.handle('settings:set', (_e, patch) => store.setSettings(patch));
  ipcMain.handle('app:openExternal', (_e, { url }) => { if (/^https?:/.test(url)) shell.openExternal(url); });

  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      offscreen: true
    }
  });
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 3) errors.push(message);
  });
  await win.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
  await new Promise((r) => setTimeout(r, 2500));

  const shots = [];
  const views = ['dashboard', 'questions', 'sites-rank', 'reputation', 'ideas'];
  for (const v of views) {
    await win.webContents.executeJavaScript(`document.querySelector('[data-view="${v}"]').click()`);
    if (v === 'ideas') {
      await win.webContents.executeJavaScript(`
        (async () => {
          document.querySelector('#idea-topic').value = 'Is Swagbucks still worth it?';
          document.querySelector('#idea-generate').click();
        })()`);
    }
    await new Promise((r) => setTimeout(r, 1200));
    const img = await win.webContents.capturePage();
    const file = path.join(__dirname, `shot-${v}.png`);
    fs.writeFileSync(file, img.toPNG());
    shots.push(file);
  }

  const dashText = await win.webContents.executeJavaScript(`document.querySelector('#view-ideas').innerText.slice(0, 400)`);
  console.log('IDEAS VIEW TEXT:\n' + dashText);
  console.log('SCREENSHOTS:', shots.join(', '));
  if (errors.length) {
    console.error('RENDERER ERRORS:\n' + errors.join('\n'));
    app.exit(1);
  } else {
    console.log('SMOKE OK — no renderer errors');
    app.exit(0);
  }
});
