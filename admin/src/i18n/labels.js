// Label helpers for enum-like values (genres, accents, difficulty) and the
// language picker. Reads the same JSON bundles the admin hands to use-intl
// so every translation lives in the translations folder.

import { messages } from './messages.js';

export const fallbackLocale = 'tm';

export const localeNames = {
  tm: messages.tm.language_tm,
  en: messages.tm.language_en,
  ru: messages.tm.language_ru
};

// Trilingual lookup tables rebuilt from the per-locale bundles so lookups by
// code and reverse lookups by any translated label keep working.
const genreLabels = trilingualLabels('genres');
const accentLabels = trilingualLabels('accents');
const difficultyLabels = trilingualLabels('difficulties');

function trilingualLabels(group) {
  const labels = {};
  for (const code of Object.keys(messages.tm[group])) {
    labels[code] = { tm: messages.tm[group][code], en: messages.en[group][code], ru: messages.ru[group][code] };
  }
  return labels;
}

export function getLanguageOptions() {
  return Object.keys(localeNames).map((code) => ({ code, label: localeNames[code] }));
}

export function translateGenre(locale, value, catalog = []) {
  const genreCode = value === 'Animation' ? 'Cartoon' : value;
  const databaseGenre = catalog.find((genre) => genre.code === genreCode);
  if (databaseGenre) return databaseGenre[locale] || databaseGenre.en || value;
  const normalized = String(genreCode || '').toLocaleLowerCase();
  const labels = genreLabels[genreCode] || Object.values(genreLabels).find((item) => Object.values(item).some((label) => label.toLocaleLowerCase() === normalized));
  return labels?.[locale] || value;
}

export function normalizeGenreCatalog(value) {
  if (!Array.isArray(value)) return [];
  return value.map((genre) => typeof genre === 'string' ? { code: genre, tm: genre, en: genre, ru: genre } : genre).filter((genre) => genre?.code);
}

export function translateAccent(locale, value) {
  return accentLabels[value]?.[locale] || value;
}

export function translateDifficulty(locale, value) {
  return difficultyLabels[value]?.[locale] || value;
}
