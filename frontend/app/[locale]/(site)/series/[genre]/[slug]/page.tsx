import type { Metadata } from 'next';
import { movieMetadata, MovieDetailRoute } from '@/src/catalog/movieDetailRoutes';
import { safeLocale } from '@/src/catalog/urls';

type DetailRouteProps = { params: Promise<{ locale: string; genre: string; slug: string }> };

export async function generateMetadata({ params }: DetailRouteProps): Promise<Metadata> {
  const { locale, slug } = await params;
  return movieMetadata({ locale: safeLocale(locale), slug });
}

export default async function SeriesDetailPage({ params }: DetailRouteProps) {
  const { locale, genre, slug } = await params;
  return <MovieDetailRoute locale={safeLocale(locale)} categoryKey="Series" genreSegment={genre} slug={slug} />;
}
