import { QueryClient } from '@tanstack/react-query';

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false
      }
    }
  });
}

// The admin app is browser-only, so a single client instance is enough.
export const queryClient = makeQueryClient();
