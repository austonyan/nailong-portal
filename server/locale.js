// Server-side locale negotiation + response localization.
//
// Content that has a `*_tw` (or `*Tw`) sibling is served in the request
// language: the base field is replaced with the Traditional value when the
// caller asks for zh-TW, and `fieldCn` is added so admin forms can still edit
// the Simplified source. Requests without a usable hint get zh-CN.

const TW_TAG = /^zh[-_](tw|hant|hk|mo)/i;

export function reqLocale(req) {
  const explicit = String(req.get('x-nailong-locale') || '').trim();
  if (explicit) return TW_TAG.test(explicit) ? 'zh-TW' : 'zh-CN';
  const accept = String(req.get('accept-language') || '');
  for (const part of accept.split(',')) {
    const tag = part.split(';')[0].trim();
    if (!tag.toLowerCase().startsWith('zh')) continue;
    return TW_TAG.test(tag) ? 'zh-TW' : 'zh-CN';
  }
  return 'zh-CN';
}

function addLocalizedPair(out, baseKey, twKey, twValue, locale) {
  if (!(baseKey in out)) return;
  out[twKey] = twValue;
  if (locale === 'zh-TW' && typeof twValue === 'string' && twValue) {
    out[`${baseKey}Cn`] = out[baseKey];
    out[baseKey] = twValue;
  }
}

export function localizeDeep(value, locale) {
  if (Array.isArray(value)) return value.map((item) => localizeDeep(item, locale));
  if (!value || typeof value !== 'object') return value;

  const out = {};
  for (const [key, item] of Object.entries(value)) {
    // Raw SQLite columns (`name_tw`) become the camel `nameTw`; the snake key
    // is dropped so callers only see one spelling.
    if (key.endsWith('_tw')) {
      out[`${key.slice(0, -3)}Tw`] = localizeDeep(item, locale);
      continue;
    }
    out[key] = localizeDeep(item, locale);
  }

  for (const [key, item] of Object.entries(out)) {
    if (!key.endsWith('Tw')) continue;
    addLocalizedPair(out, key.slice(0, -2), key, item, locale);
  }

  return out;
}

export function localeMiddleware(req, res, next) {
  const locale = reqLocale(req);
  const json = res.json.bind(res);
  res.json = (body) => json(localizeDeep(body, locale));
  next();
}

// For non-JSON surfaces (CSV, print HTML) that cannot use the middleware.
export function pickText(cn, tw, locale) {
  return locale === 'zh-TW' && tw ? tw : cn;
}