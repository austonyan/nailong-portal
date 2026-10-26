import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import zhCN from './locales/zh-CN.json';
import zhTW from './locales/zh-TW.json';

// ---------------------------------------------------------------------------
// 硬性规定(不可绕过):i18n 必须同时提供简体中文(zh-CN)与繁体中文(zh-TW)。
// REQUIRED_LOCALES 是唯一语言白名单:supportedLngs 锁定它,fallback 指向 zh-CN,
// 启动时 assertRequiredLocales() 会校验两种语言资源齐全且键结构一致。
// 新增语言必须先补齐两份中文的对应键,再扩展此列表。
// ---------------------------------------------------------------------------
export const REQUIRED_LOCALES = Object.freeze(['zh-CN', 'zh-TW']);
export const DEFAULT_LOCALE = 'zh-CN';
export const LANGUAGE_STORAGE_KEY = 'nailong.language';

export const RESOURCES = {
  'zh-CN': { translation: zhCN },
  'zh-TW': { translation: zhTW },
};

function flattenKeys(obj, prefix = '', out = []) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') flattenKeys(value, path, out);
    else out.push(path);
  }
  return out;
}

// Dev-time guard: both required locales must exist with identical key sets.
export function assertRequiredLocales(resources = RESOURCES) {
  for (const lng of REQUIRED_LOCALES) {
    if (!resources[lng]?.translation) {
      throw new Error(`[i18n] 缺少必需语言资源: ${lng} / missing required locale`);
    }
  }
  const [first, ...rest] = REQUIRED_LOCALES;
  const base = new Set(flattenKeys(resources[first].translation));
  for (const lng of rest) {
    const keys = new Set(flattenKeys(resources[lng].translation));
    const missing = [...base].filter((k) => !keys.has(k));
    const extra = [...keys].filter((k) => !base.has(k));
    if (missing.length || extra.length) {
      throw new Error(
        `[i18n] ${lng} 与 ${first} 的键结构不一致; missing: [${missing.join(', ')}], extra: [${extra.join(', ')}]`
      );
    }
  }
}

function detectLanguage() {
  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (saved && REQUIRED_LOCALES.includes(saved)) return saved;
  for (const candidate of navigator.languages ?? [navigator.language]) {
    const lower = String(candidate).toLowerCase();
    if (lower.startsWith('zh-tw') || lower.startsWith('zh-hant') || lower.startsWith('zh-hk') || lower.startsWith('zh-mo')) {
      return 'zh-TW';
    }
    if (lower.startsWith('zh')) return DEFAULT_LOCALE;
  }
  return DEFAULT_LOCALE;
}

export function setLanguage(lng) {
  if (!REQUIRED_LOCALES.includes(lng)) return;
  i18n.changeLanguage(lng);
  localStorage.setItem(LANGUAGE_STORAGE_KEY, lng);
  document.documentElement.lang = lng;
}

assertRequiredLocales();

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: RESOURCES,
    lng: detectLanguage(),
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: [...REQUIRED_LOCALES],
    nonExplicitSupportedLngs: false,
    interpolation: { escapeValue: false },
    returnEmptyString: false,
    // Render raw keys instead of throwing, but surface them in dev so a
    // drifted prefix cannot ship silently (i18next only calls the handler
    // when saveMissing is on).
    saveMissing: import.meta.env.DEV,
    missingKeyHandler: import.meta.env.DEV
      ? (lngs, ns, key) => console.warn(`[i18n] missing key: ${lngs.join(',')} / ${key}`)
      : undefined,
  });
  document.documentElement.lang = i18n.language;
}

export default i18n;
