import type { Genre, Movie } from '../api/types';

// Locale codes shared by routing, the UI locale provider and SEO surfaces.
export const locales = ['tm', 'en', 'ru'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'tm';

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

/** Normalizes a possibly invalid locale value to the URL default. */
export function safeLocale(value: string | undefined | null): Locale {
  return value && isLocale(value) ? value : defaultLocale;
}

export const categoryKeys = ['Movie', 'Series', 'Cartoon'] as const;
export type CategoryKey = (typeof categoryKeys)[number];

// Localized category segments per locale. The default locale (tm) intentionally
// reuses the canonical Latin spellings so unprefixed URLs read /movies, /series,
// /cartoons. Keep in sync with the pathnames in src/i18n/routing.ts.
const localizedCategorySegments: Record<CategoryKey, Record<Locale, string>> = {
  Movie: { tm: 'movies', en: 'movies', ru: 'filmy' },
  Series: { tm: 'series', en: 'series', ru: 'serialy' },
  Cartoon: { tm: 'cartoons', en: 'cartoons', ru: 'multfilmy' }
};

export function categorySegment(key: CategoryKey, locale: Locale): string {
  return localizedCategorySegments[key][locale];
}

/** Resolves a URL segment back to a category key, accepting any locale's spelling. */
export function categoryKeyFromSegment(segment: string): CategoryKey | null {
  const value = String(segment || '').toLowerCase();
  for (const key of categoryKeys) {
    if (Object.values(localizedCategorySegments[key]).some((candidate) => candidate === value)) return key;
  }
  return null;
}

export function categoryLabelKey(key: CategoryKey): string {
  return key === 'Series' ? 'nav_series' : key === 'Cartoon' ? 'nav_cartoons' : 'nav_movies';
}

/** Maps raw backend type values onto a catalog category (moved from the old HomeView). */
export function normalizeType(type?: string | null): CategoryKey {
  if (type === 'Animation' || type === 'Animations' || type === 'Cartoon' || type === 'Cartoons') return 'Cartoon';
  if (type === 'Series') return 'Series';
  return 'Movie';
}

export function categoryOf(movie: Pick<Movie, 'type'>): CategoryKey {
  return normalizeType(movie.type);
}

/** Genre slugs are locale-independent Latin segments derived from the genre code. */
export function genreSlug(code: string): string {
  return encodeURIComponent(String(code || '').trim().toLowerCase()).replace(/%20/g, '-');
}

/** Resolves a genre slug back to the canonical genre code using the backend catalog. */
export function genreCodeFromSlug(slug: string, catalog: Genre[] = []): string | null {
  const value = String(slug || '').toLowerCase();
  if (!value) return null;
  return catalog.find((genre) => genreSlug(genre.code).toLowerCase() === value)?.code ?? null;
}

export function primaryGenre(movie: Pick<Movie, 'genres' | 'genre'>): string | null {
  if (movie.genres?.length) return movie.genres[0];
  return movie.genre || null;
}

/** All genre codes attached to a movie (genres array with single-genre fallback). */
export function movieGenreCodes(movie: Pick<Movie, 'genres' | 'genre'>): string[] {
  if (movie.genres?.length) return movie.genres;
  return movie.genre ? [movie.genre] : [];
}

export function movieInCategory(movie: Pick<Movie, 'type'>, categoryKey: CategoryKey): boolean {
  return normalizeType(movie.type) === categoryKey;
}

/** Prefixes a path with the locale for non-default locales (tm stays unprefixed). */
export function withLocale(locale: Locale, path: string): string {
  if (locale === defaultLocale) return path;
  return path === '/' ? `/${locale}` : `/${locale}${path}`;
}

export function homeUrl(locale: Locale): string {
  return withLocale(locale, '/');
}

export type CatalogUrlOptions = { category: CategoryKey; genre?: string | null; slug?: string | null };

/** Builds a localized catalog URL: /{category}[/{genre}[/{slug}]]. */
export function catalogUrl(locale: Locale, options: CatalogUrlOptions): string {
  let path = `/${categorySegment(options.category, locale)}`;
  if (options.genre) path += `/${genreSlug(options.genre)}`;
  if (options.slug) path += `/${options.slug}`;
  return withLocale(locale, path);
}

/** Builds the URL matching a concrete request: /{category}[/{genre-segment}]/{slug}. */
export function detailUrl(locale: Locale, category: CategoryKey, genreSegment: string | null | undefined, slug: string): string {
  const genrePart = genreSegment ? `/${genreSegment}` : '';
  return withLocale(locale, `/${categorySegment(category, locale)}${genrePart}/${slug}`);
}

/** Canonical public URL for a movie: nested under its primary genre when present. */
export function movieUrl(locale: Locale, movie: Pick<Movie, 'slug' | 'type' | 'genres' | 'genre'>): string {
  return catalogUrl(locale, { category: categoryOf(movie), genre: primaryGenre(movie), slug: movie.slug });
}

export type ParsedPathname = { locale: Locale; category: CategoryKey | null; segments: string[] };

/** Parses a browser pathname (localized or canonical) into locale + catalog context. */
export function parsePathname(pathname: string): ParsedPathname {
  const raw = String(pathname || '')
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    });
  let index = 0;
  let locale = defaultLocale;
  if (raw.length && isLocale(raw[0])) {
    locale = raw[0];
    index = 1;
  }
  const category = index < raw.length ? categoryKeyFromSegment(raw[index]) : null;
  if (category) index += 1;
  return { locale, category, segments: raw.slice(index) };
}

/** Rebuilds a parsed pathname for another locale (genre/slug segments are locale-independent). */
export function rebuildPathname(locale: Locale, parsed: ParsedPathname): string {
  const base = parsed.category ? `/${categorySegment(parsed.category, locale)}` : '';
  const tail = parsed.segments.length ? `/${parsed.segments.map(encodeURIComponent).join('/')}` : '';
  if (!base && !tail) return withLocale(locale, '/');
  return withLocale(locale, `${base}${tail}`);
}

/** hreflang alternates for a set of per-locale paths, with x-default pointing at tm. */
export function alternatesFor(build: (locale: Locale) => string): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const locale of locales) languages[locale] = build(locale);
  languages['x-default'] = build(defaultLocale);
  return languages;
}
