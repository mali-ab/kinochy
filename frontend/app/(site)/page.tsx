import { Suspense } from 'react';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { genresQuery, moviesQuery } from '@/src/api/queries';
import { getQueryClient } from '@/src/providers/queryClient';
import { CatalogPageSkeleton } from '@/src/ui/skeleton.jsx';
import HomeView from '@/src/views/HomeView';

export default async function HomeRoute({ searchParams }: { searchParams: Promise<{ search?: string; category?: string }> }) {
  const { search = '' } = await searchParams;
  const queryClient = getQueryClient();
  await Promise.allSettled([queryClient.prefetchQuery(moviesQuery(search)), queryClient.prefetchQuery(genresQuery())]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={<CatalogPageSkeleton />}>
        <HomeView />
      </Suspense>
    </HydrationBoundary>
  );
}
