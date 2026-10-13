import type { Metadata } from 'next';
import { getGenres, getMovies } from '@/src/api/endpoints';
import { CatalogRoute, genreMetadata, type CatalogSearchParams } from '@/src/catalog/catalogRoutes';
import { MovieDetailRoute, movieMetadata as detailMetadata } from '@/src/catalog/movieDetailRoutes';
import { genreCodeFromSlug, movieGenreCodes, movieInCategory, safeLocale } from '@/src/catalog/urls';

type GenreRouteProps = { params: Promise<{ locale: string; genre: string }>; searchParams: Promise<CatalogSearchParams> };

/**
 * Doubles as the genre listing route and the legacy flat detail route: a
 * segment that matches a genre slug lists that genre, anything else is
 * treated as a movie slug (and redirected to its canonical nested URL).
 */
export async function generateMetadata({ params }: GenreRouteProps): Promise<Metadata> {
  const { locale, genre } = await params;
  const safe = safeLocale(locale);
  const genres = await getGenres().catch(() => []);
  const genreCode = genreCodeFromSlug(genre, genres);
  if (!genreCode) return detailMetadata({ locale: safe, slug: genre });
  const movies = await getMovies().catch(() => []);
  const empty = !movies.some((movie) => movieInCategory(movie, 'Movie') && movieGenreCodes(movie).includes(genreCode));
  return genreMetadata(safe, 'Movie', genreCode, empty);
}

export default async function MovieGenreRoute({ params, searchParams }: GenreRouteProps) {
  const { locale, genre } = await params;
  const { search = '' } = await searchParams;
  const safe = safeLocale(locale);
  const genres = await getGenres().catch(() => []);
  const genreCode = genreCodeFromSlug(genre, genres);
  if (genreCode) return <CatalogRoute locale={safe} categoryKey="Movie" genreCode={genreCode} search={search} />;
  return <MovieDetailRoute locale={safe} categoryKey="Movie" slug={genre} />;
}
