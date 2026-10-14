// Locale-agnostic label helpers shared by client and server code. The enum
// translation helpers that need the message bundles live in labelHelpers.js
// (server-only) and useEnumLabels.jsx (client), so this module stays free of
// translation imports and is safe to load in the browser bundle.

export const fallbackLocale = 'tm';

// The language_* strings are identical across translations/{tm,en,ru}.json.
export const localeNames = {
  tm: 'Türkmençe',
  en: 'English',
  ru: 'Русский'
};

export function getLanguageOptions() {
  return Object.keys(localeNames).map((code) => ({ code, label: localeNames[code] }));
}

export function normalizeGenreCatalog(value) {
  if (!Array.isArray(value)) return [];
  return value.map((genre) => typeof genre === 'string' ? { code: genre, tm: genre, en: genre, ru: genre } : genre).filter((genre) => genre?.code);
}
