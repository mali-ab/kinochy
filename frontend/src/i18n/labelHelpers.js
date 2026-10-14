// Server-only enum translation helpers (genres, accents, difficulty). Importing
// this module pulls every message bundle, so it must never be imported from
// client components — client code uses the useEnumLabels hook instead.

import { messages } from './messages.js';

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

export function translateGenre(locale, value, catalog = []) {
  const genreCode = value === 'Animation' ? 'Cartoon' : value;
  const databaseGenre = catalog.find((genre) => genre.code === genreCode);
  if (databaseGenre) return databaseGenre[locale] || databaseGenre.en || value;
  const normalized = String(genreCode || '').toLocaleLowerCase();
  const labels = genreLabels[genreCode] || Object.values(genreLabels).find((item) => Object.values(item).some((label) => label.toLocaleLowerCase() === normalized));
  return labels?.[locale] || value;
}

export function translateAccent(locale, value) {
  return accentLabels[value]?.[locale] || value;
}

export function translateDifficulty(locale, value) {
  return difficultyLabels[value]?.[locale] || value;
}
