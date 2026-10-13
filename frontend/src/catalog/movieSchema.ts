import { siteUrl } from '../api/config';
import type { Movie } from '../api/types';
import { movieUrl, normalizeType, type Locale } from './urls';

export function openGraphType(movie: Pick<Movie, 'type'>): 'video.tv_show' | 'video.movie' {
  return normalizeType(movie.type) === 'Series' ? 'video.tv_show' : 'video.movie';
}

/** JSON-LD structured data for a movie detail page, pointing at its canonical URL. */
export function buildMovieSchema(movie: Movie, locale: Locale) {
  const genres = movie.genres?.length ? movie.genres : movie.genre ? [movie.genre] : [];
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': normalizeType(movie.type) === 'Series' ? 'TVSeries' : 'Movie',
    name: movie.title,
    description: movie.description || undefined,
    image: movie.coverUrl ? `${siteUrl}${movie.coverUrl}` : undefined,
    datePublished: movie.year ? String(movie.year) : undefined,
    genre: genres.length ? genres : undefined,
    inLanguage: 'en',
    url: `${siteUrl}${movieUrl(locale, movie)}`
  };
  return schema;
}
