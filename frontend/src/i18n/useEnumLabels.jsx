'use client';

import { useTranslations } from 'next-intl';
import { useLocale } from '../ui/locale.jsx';

/**
 * Client-side enum label translator (genres, accents, difficulty).
 *
 * Only the active locale's messages are available here (provided by
 * NextIntlClientProvider), so the browser bundle no longer ships every
 * language's bundle like the old trilingual label tables did. Values that
 * have no matching message key fall back to the raw value, mirroring the
 * previous translate* helpers.
 */
export function useEnumLabels() {
  const { locale } = useLocale();
  const tGenres = useTranslations('genres');
  const tAccents = useTranslations('accents');
  const tDifficulties = useTranslations('difficulties');

  function genre(value, catalog = []) {
    const genreCode = value === 'Animation' ? 'Cartoon' : value;
    const databaseGenre = catalog.find((item) => item.code === genreCode);
    if (databaseGenre) return databaseGenre[locale] || databaseGenre.en || value;
    return genreCode && tGenres.has(genreCode) ? tGenres(genreCode) : value;
  }

  function accent(value) {
    return value && tAccents.has(value) ? tAccents(value) : value;
  }

  function difficulty(value) {
    return value && tDifficulties.has(value) ? tDifficulties(value) : value;
  }

  return { genre, accent, difficulty };
}
