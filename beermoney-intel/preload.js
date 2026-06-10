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
