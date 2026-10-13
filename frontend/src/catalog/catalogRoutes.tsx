import { Suspense } from 'react';
import type { Metadata } from 'next';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { genresQuery, moviesQuery } from '@/src/api/queries';
import { getQueryClient } from '@/src/providers/queryClient';
import { CatalogPageSkeleton } from '@/src/ui/skeleton.jsx';
import { t, translateGenre } from '@/src/ui/translations.js';
import CatalogView from '@/src/views/CatalogView';
import { alternatesFor, catalogUrl, categoryLabelKey, homeUrl, safeLocale, type CategoryKey, type Locale } from './urls';

export type CatalogSearchParams = { search?: string };

/**
 * Server-prefetched catalog listing shared by the home, category and genre
 * routes. Category and genre selection are URL-driven.
 *
 * Data loading happens inside the Suspense boundary so the shell (nav +
 * skeleton) streams immediately, while redirects/notFound thrown by the
 * surrounding route still resolve before the response starts.
 */
export function CatalogRoute({ locale, categoryKey = null, genreCode = null, search = '' }: {
  locale: Locale;
  categoryKey?: CategoryKey | null;
  genreCode?: string | null;
  search?: string;
}) {
  return (
    <Suspense fallback={<CatalogPageSkeleton />}>
      <CatalogContent categoryKey={categoryKey} genreCode={genreCode} search={search} />
    </Suspense>
  );
}

async function CatalogContent({ categoryKey = null, genreCode = null, search = '' }: {
  categoryKey?: CategoryKey | null;
  genreCode?: string | null;
  search?: string;
}) {
  const queryClient = getQueryClient();
  await Promise.allSettled([queryClient.prefetchQuery(moviesQuery(search)), queryClient.prefetchQuery(genresQuery())]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <CatalogView categoryKey={categoryKey} genreCode={genreCode} />
    </HydrationBoundary>
  );
}

export function homeMetadata(locale: Locale): Metadata {
  const safe = safeLocale(locale);
  return {
    title: t(safe, 'seo_home_title'),
    description: t(safe, 'seo_home_description'),
    alternates: { canonical: homeUrl(safe), languages: alternatesFor((candidate) => homeUrl(candidate)) }
  };
}

export function categoryMetadata(locale: Locale, categoryKey: CategoryKey): Metadata {
  const safe = safeLocale(locale);
  const label = t(safe, categoryLabelKey(categoryKey));
  return {
    title: `${label} · Kinochy`,
    description: `${label} — ${t(safe, 'seo_catalog_description')}`,
    alternates: {
      canonical: catalogUrl(safe, { category: categoryKey }),
      languages: alternatesFor((candidate) => catalogUrl(candidate, { category: categoryKey }))
    }
  };
}

export function genreMetadata(locale: Locale, categoryKey: CategoryKey, genreCode: string, empty = false): Metadata {
  const safe = safeLocale(locale);
  const genreLabel = translateGenre(safe, genreCode);
  const categoryLabel = t(safe, categoryLabelKey(categoryKey));
  return {
    title: `${genreLabel} · ${categoryLabel} · Kinochy`,
    description: `${genreLabel} — ${categoryLabel}: ${t(safe, 'seo_catalog_description')}`,
    robots: empty ? { index: false } : undefined,
    alternates: {
      canonical: catalogUrl(safe, { category: categoryKey, genre: genreCode }),
      languages: alternatesFor((candidate) => catalogUrl(candidate, { category: categoryKey, genre: genreCode }))
    }
  };
}
