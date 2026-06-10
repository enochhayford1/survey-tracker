'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  status: (opts) => ipcRenderer.invoke('intel:status', opts || {}),
  topQuestions: (days) => ipcRenderer.invoke('intel:topQuestions', { days }),
  topSites: (days) => ipcRenderer.invoke('intel:topSites', { days }),
  rising: () => ipcRenderer.invoke('intel:rising'),
  reputation: (days) => ipcRenderer.invoke('intel:reputation', { days }),
  watchlist: (days) => ipcRenderer.invoke('intel:watchlist', { days }),

  exploreKeywords: (seed) => ipcRenderer.invoke('keywords:explore', { seed }),
  volumeProviders: () => ipcRenderer.invoke('keywords:providers'),

  opportunities: (days) => ipcRenderer.invoke('opps:list', { days }),
  checkCompetition: (keyword, force) => ipcRenderer.invoke('serp:check', { keyword, force }),
  minePainPoints: (siteId) => ipcRenderer.invoke('pain:mine', { siteId }),
  fetchCompetitorFeeds: () => ipcRenderer.invoke('feeds:fetchAll'),
  siteHistory: () => ipcRenderer.invoke('intel:siteHistory'),

  aiDraft: (opts) => ipcRenderer.invoke('ai:draft', opts),
  aiModels: () => ipcRenderer.invoke('ai:models'),
  onDraftChunk: (cb) => {
    ipcRenderer.removeAllListeners('ai:draft:chunk');
    ipcRenderer.on('ai:draft:chunk', (_e, text) => cb(text));
  },
  aiBriefing: () => ipcRenderer.invoke('ai:briefing'),
  onBriefingChunk: (cb) => {
    ipcRenderer.removeAllListeners('ai:briefing:chunk');
    ipcRenderer.on('ai:briefing:chunk', (_e, text) => cb(text));
  },

  rankCheck: () => ipcRenderer.invoke('rank:check'),
  rankHistory: () => ipcRenderer.invoke('rank:history'),

  factoryQueue: (items) => ipcRenderer.invoke('factory:queue', { items }),
  factoryActive: () => ipcRenderer.invoke('factory:active'),
  factoryStatus: () => ipcRenderer.invoke('factory:status'),

  alertsList: () => ipcRenderer.invoke('alerts:list'),
  alertsClear: () => ipcRenderer.invoke('alerts:clear'),

  generateIdeas: (topic, site) => ipcRenderer.invoke('ideas:generate', { topic, site }),

  listSites: () => ipcRenderer.invoke('sites:list'),
  addCustomSite: (site) => ipcRenderer.invoke('sites:addCustom', site),
  updateSite: (id, patch) => ipcRenderer.invoke('sites:update', { id, patch }),
  deleteCustomSite: (id) => ipcRenderer.invoke('sites:deleteCustom', { id }),

  getCollection: (name) => ipcRenderer.invoke('collection:get', { name }),
  setCollection: (name, items) => ipcRenderer.invoke('collection:set', { name, items }),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),

  openExternal: (url) => ipcRenderer.invoke('app:openExternal', { url })
});
