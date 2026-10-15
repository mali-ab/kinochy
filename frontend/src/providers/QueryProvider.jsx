'use client';

import { HydrationBoundary, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { getQueryClient } from './queryClient';
import { restorePublicQueries, subscribeToPublicQueries } from './queryPersistence';

export default function QueryProvider({ children, state = undefined }) {
  const [queryClient] = useState(getQueryClient);
  useEffect(() => {
    restorePublicQueries(queryClient);
    return subscribeToPublicQueries(queryClient);
  }, [queryClient]);
  return (
    <QueryClientProvider client={queryClient}>
      <HydrationBoundary state={state}>{children}</HydrationBoundary>
    </QueryClientProvider>
  );
}
