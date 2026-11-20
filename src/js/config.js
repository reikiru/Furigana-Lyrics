const API_KEY_STORAGE = 'furigana_api_config_v2';
const PREF_STORAGE = 'furigana_prefs_v2';

export const DEFAULT_API_CONFIG = {
  apiKey: '',
  model: 'deepseek-chat',
  baseUrl: 'https://api.deepseek.com/v1',
};

export const DEFAULT_PREFS = {
  theme: 'washi',
  fontSize: 20,
  lineHeight: 2.6,
  maxWidth: 1080,
  customBg: '',
  showRuby: true,
};

export const SAMPLE_LYRICS = `夢を見たんだ
夜空に浮かぶ星が
手を伸ばせば届きそうで
でも消えてしまう

風の匂いが変わったら
また新しい季節が始まる`;

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback };
  } catch {
    return { ...fallback };
  }
}

export function loadApiConfig() {
  return readJson(API_KEY_STORAGE, DEFAULT_API_CONFIG);
}

export function saveApiConfig(next) {
  const merged = {
    ...DEFAULT_API_CONFIG,
    ...next,
    baseUrl: (next.baseUrl || DEFAULT_API_CONFIG.baseUrl).trim().replace(/\/+$/, ''),
    model: (next.model || DEFAULT_API_CONFIG.model).trim(),
    apiKey: (next.apiKey || '').trim(),
  };
  localStorage.setItem(API_KEY_STORAGE, JSON.stringify(merged));
  return merged;
}

export function loadPrefs() {
  return readJson(PREF_STORAGE, DEFAULT_PREFS);
}

export function savePrefs(next) {
  const merged = { ...DEFAULT_PREFS, ...next };
  localStorage.setItem(PREF_STORAGE, JSON.stringify(merged));
  return merged;
}
