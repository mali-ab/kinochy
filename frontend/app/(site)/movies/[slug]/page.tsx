import type { Metadata } from 'next';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { siteUrl } from '@/src/api/config';
import { getMovie } from '@/src/api/endpoints';
import { commentsQuery, movieQuery, recommendationsQuery, seasonsQuery } from '@/src/api/queries';
import type { Movie } from '@/src/api/types';
import { getQueryClient } from '@/src/providers/queryClient';
import MovieView from '@/src/views/MovieView';

type MovieRouteProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: MovieRouteProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const movie = await getMovie(slug);
    const description = movie.description ? String(movie.description).slice(0, 160) : undefined;
    return {
      title: `${movie.title} · Kinochy`,
      description,
      alternates: { canonical: `/movies/${movie.slug}` },
      openGraph: {
        title: movie.title,
        description,
        type: movie.type === 'Series' ? 'video.tv_show' : 'video.movie',
        url: `/movies/${movie.slug}`,
        images: movie.coverUrl ? [{ url: movie.coverUrl }] : undefined
      }
    };
  } catch {
    return { title: 'Movie not found · Kinochy', robots: { index: false } };
  }
}

export default async function MovieRoute({ params }: MovieRouteProps) {
  const { slug } = await params;
  const queryClient = getQueryClient();
  await Promise.allSettled([
    queryClient.prefetchQuery(movieQuery(slug)),
    queryClient.prefetchQuery(recommendationsQuery(slug)),
    queryClient.prefetchQuery(seasonsQuery(slug)),
    queryClient.prefetchQuery(commentsQuery(slug))
  ]);
  const movie = queryClient.getQueryData<Movie>(movieQuery(slug).queryKey);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <MovieView slug={slug} />
      {movie ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(buildMovieSchema(movie)) }} /> : null}
    </HydrationBoundary>
  );
}

function buildMovieSchema(movie: Movie) {
  const genres = movie.genres?.length ? movie.genres : movie.genre ? [movie.genre] : [];
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': movie.type === 'Series' ? 'TVSeries' : 'Movie',
    name: movie.title,
    description: movie.description || undefined,
    image: movie.coverUrl ? `${siteUrl}${movie.coverUrl}` : undefined,
    datePublished: movie.year ? String(movie.year) : undefined,
    genre: genres.length ? genres : undefined,
    inLanguage: 'en',
    url: `${siteUrl}/movies/${movie.slug}`
  };
  return schema;
}
