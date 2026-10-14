// Locale helpers shared with the public site's URL scheme. The admin panel
// keeps the stored language preference instead of URL locale prefixes.
// Keep in sync with frontend/src/catalog/urls.ts.
export const locales = ['tm', 'en', 'ru'];
export const defaultLocale = 'tm';

export function isLocale(value) {
  return locales.includes(value);
}

/** Normalizes a possibly invalid locale value to the stored default. */
export function safeLocale(value) {
  return value && isLocale(value) ? value : defaultLocale;
}

/** Prefixes a path with the locale for non-default locales (tm stays unprefixed). */
export function withLocale(locale, path) {
  if (locale === defaultLocale) return path;
  return path === '/' ? `/${locale}` : `/${locale}${path}`;
}
