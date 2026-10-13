'use client';

import { HydrationBoundary, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { getQueryClient } from './queryClient';

export default function QueryProvider({ children, state = undefined }) {
  const [queryClient] = useState(getQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <HydrationBoundary state={state}>{children}</HydrationBoundary>
    </QueryClientProvider>
  );
}
