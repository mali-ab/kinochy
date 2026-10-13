import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { getMovie } from '@/src/api/endpoints';
import { commentsQuery, movieQuery, recommendationsQuery, seasonsQuery } from '@/src/api/queries';
import type { Movie } from '@/src/api/types';
import { getQueryClient } from '@/src/providers/queryClient';
import MovieView from '@/src/views/MovieView';
import { buildMovieSchema, openGraphType } from './movieSchema';
import { alternatesFor, detailUrl, movieUrl, safeLocale, type CategoryKey, type Locale } from './urls';

export type DetailRouteProps = {
  locale: Locale;
  categoryKey: CategoryKey;
  /** URL genre segment; absent on legacy flat detail URLs. */
  genreSegment?: string | null;
  slug: string;
};

/**
 * Movie detail route. Any request that is not the canonical nested path
 * /{category}/{genre}/{slug} (or /{category}/{slug} for titles without a
 * genre) permanently redirects there — this also upgrades the legacy flat
 * /movies/{slug} URLs while keeping their SEO value.
 */
export async function MovieDetailRoute({ locale, categoryKey, genreSegment = null, slug }: DetailRouteProps) {
  const safe = safeLocale(locale);
  const queryClient = getQueryClient();
  await Promise.allSettled([
    queryClient.prefetchQuery(movieQuery(slug)),
    queryClient.prefetchQuery(recommendationsQuery(slug)),
    queryClient.prefetchQuery(seasonsQuery(slug)),
    queryClient.prefetchQuery(commentsQuery(slug))
  ]);
  const movie = queryClient.getQueryData<Movie>(movieQuery(slug).queryKey);
  if (!movie) notFound();

  const requested = detailUrl(safe, categoryKey, genreSegment, slug);
  const canonical = movieUrl(safe, movie);
  if (requested !== canonical) permanentRedirect(canonical);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <MovieView slug={slug} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(buildMovieSchema(movie, safe)) }} />
    </HydrationBoundary>
  );
}

export async function movieMetadata({ locale, slug }: { locale: Locale; slug: string }): Promise<Metadata> {
  const safe = safeLocale(locale);
  try {
    const movie = await getMovie(slug);
    const description = movie.description ? String(movie.description).slice(0, 160) : undefined;
    return {
      title: `${movie.title} · Kinochy`,
      description,
      alternates: {
        canonical: movieUrl(safe, movie),
        languages: alternatesFor((candidate) => movieUrl(candidate, movie))
      },
      openGraph: {
        title: movie.title,
        description,
        type: openGraphType(movie),
        url: movieUrl(safe, movie),
        images: movie.coverUrl ? [{ url: movie.coverUrl }] : undefined
      }
    };
  } catch {
    return { title: 'Movie not found · Kinochy', robots: { index: false } };
  }
}
