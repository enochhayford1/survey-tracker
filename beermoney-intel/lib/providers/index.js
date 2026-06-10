'use strict';

/**
 * Search-volume provider layer.
 *
 * The app ships with free sources (Reddit + Google Autocomplete). Real search
 * volume requires a paid keyword API. To plug one in later, add an entry to
 * VOLUME_PROVIDERS below implementing:
 *
 *   async getVolumes(keywords: string[], apiKey: string)
 *     -> [{ keyword, volume: number|null, cpc: number|null }]
 *
 * then select it (and paste the key) in the app's Settings screen. The
 * Keyword Explorer will automatically annotate suggestions with volumes.
 * Good candidates: DataForSEO (keywords_data endpoint), SerpApi, Keywords
 * Everywhere API.
 */
const VOLUME_PROVIDERS = {
  none: {
    label: 'None (free sources only)',
    async getVolumes(keywords) {
      return keywords.map((keyword) => ({ keyword, volume: null, cpc: null }));
    }
  }
  // Example skeleton for a paid provider:
  // dataforseo: {
  //   label: 'DataForSEO',
  //   async getVolumes(keywords, apiKey) { ...POST to their API, map results... }
  // }
};

function getVolumeProvider(name) {
  return VOLUME_PROVIDERS[name] || VOLUME_PROVIDERS.none;
}

function listVolumeProviders() {
  return Object.entries(VOLUME_PROVIDERS).map(([id, p]) => ({ id, label: p.label }));
}

module.exports = { getVolumeProvider, listVolumeProviders };
