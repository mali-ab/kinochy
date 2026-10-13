import type { Metadata } from 'next';
import { CatalogRoute, categoryMetadata, type CatalogSearchParams } from '@/src/catalog/catalogRoutes';
import { safeLocale } from '@/src/catalog/urls';

type CategoryRouteProps = { params: Promise<{ locale: string }>; searchParams: Promise<CatalogSearchParams> };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return categoryMetadata(safeLocale(locale), 'Series');
}

export default async function SeriesRoute({ params, searchParams }: CategoryRouteProps) {
  const { locale } = await params;
  const { search = '' } = await searchParams;
  return <CatalogRoute locale={safeLocale(locale)} categoryKey="Series" search={search} />;
}
