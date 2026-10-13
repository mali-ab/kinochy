import type { MetadataRoute } from 'next';
import { siteUrl } from '@/src/api/config';
import { getGenres, getMovies } from '@/src/api/endpoints';
import type { Genre, Movie } from '@/src/api/types';
import {
  alternatesFor,
  catalogUrl,
  categoryKeys,
  defaultLocale,
  homeUrl,
  movieGenreCodes,
  movieInCategory,
  movieUrl,
  withLocale,
  type CategoryKey,
  type Locale
} from '@/src/catalog/urls';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    entry((locale) => homeUrl(locale), { changeFrequency: 'daily', priority: 1 }),
    entry((locale) => withLocale(locale, '/subscription'), { changeFrequency: 'monthly', priority: 0.5 }),
    entry((locale) => withLocale(locale, '/login'), { changeFrequency: 'yearly', priority: 0.3 }),
    entry((locale) => withLocale(locale, '/signup'), { changeFrequency: 'yearly', priority: 0.3 })
  ];
  try {
    const [movies, genres] = await Promise.all([getMovies('', { revalidate: 3600 }), getGenres({ revalidate: 3600 })]);
    return [
      ...staticRoutes,
      ...categoryKeys.map((key): MetadataRoute.Sitemap[number] => entry((locale) => catalogUrl(locale, { category: key }), { changeFrequency: 'daily', priority: 0.9 })),
      ...genreEntries(movies, genres),
      ...movies.map((movie): MetadataRoute.Sitemap[number] => entry((locale) => movieUrl(locale, movie), { changeFrequency: 'weekly', priority: 0.8, lastModified: movie.updatedAt ? new Date(movie.updatedAt) : undefined }))
    ];
  } catch {
    return staticRoutes;
  }
}

/** Genre listing pages, only for genre/category combinations that have titles. */
function genreEntries(movies: Movie[], genres: Genre[]): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];
  for (const categoryKey of categoryKeys) {
    for (const genre of genres) {
      const present = movies.some((movie) => movieInCategory(movie, categoryKey) && movieGenreCodes(movie).includes(genre.code));
      if (!present) continue;
      entries.push(entry((locale) => catalogUrl(locale, { category: categoryKey, genre: genre.code }), { changeFrequency: 'weekly', priority: 0.7 }));
    }
  }
  return entries;
}

function entry(build: (locale: Locale) => string, extra: { changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']; priority: number; lastModified?: Date }): MetadataRoute.Sitemap[number] {
  return {
    url: `${siteUrl}${build(defaultLocale)}`,
    lastModified: extra.lastModified,
    changeFrequency: extra.changeFrequency,
    priority: extra.priority,
    // Sitemap hreflang annotations must be absolute; unlike page metadata they
    // are not resolved against metadataBase.
    alternates: { languages: alternatesFor((locale) => `${siteUrl}${build(locale)}`) }
  };
}
