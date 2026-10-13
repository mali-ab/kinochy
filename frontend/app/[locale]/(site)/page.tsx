import type { Metadata } from 'next';
import { CatalogRoute, homeMetadata, type CatalogSearchParams } from '@/src/catalog/catalogRoutes';
import { safeLocale } from '@/src/catalog/urls';

type HomeRouteProps = { params: Promise<{ locale: string }>; searchParams: Promise<CatalogSearchParams> };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return homeMetadata(safeLocale(locale));
}

export default async function HomeRoute({ params, searchParams }: HomeRouteProps) {
  const { locale } = await params;
  const { search = '' } = await searchParams;
  return <CatalogRoute locale={safeLocale(locale)} search={search} />;
}
