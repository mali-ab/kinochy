import { dehydrate, hydrate, type DehydratedState, type QueryClient } from '@tanstack/react-query';

const storageKey = 'kinochy:public-query-cache:v2';
const maxAge = 24 * 60 * 60 * 1000;

function isPublicQuery(queryKey: readonly unknown[]): boolean {
  return queryKey[0] === 'movies' || queryKey[0] === 'genres' || queryKey[0] === 'countries' || queryKey[0] === 'movie';
}

export function restorePublicQueries(client: QueryClient): void {
  if (typeof window === 'undefined') return;
  try {
    const cached = JSON.parse(window.localStorage.getItem(storageKey) ?? 'null') as { savedAt?: number; state?: unknown } | null;
    if (!cached?.savedAt || !cached.state || Date.now() - cached.savedAt > maxAge) {
      window.localStorage.removeItem(storageKey);
      return;
    }
    const state = cached.state as DehydratedState;
    const missingState = {
      ...state,
      queries: state.queries.filter((query) => !client.getQueryState(query.queryKey))
    };
    hydrate(client, missingState);
  } catch {
    window.localStorage.removeItem(storageKey);
  }
}

export function subscribeToPublicQueries(client: QueryClient): () => void {
  if (typeof window === 'undefined') return () => undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsubscribe = client.getQueryCache().subscribe(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        const state = dehydrate(client, {
          shouldDehydrateQuery: (query) => query.state.status === 'success' && isPublicQuery(query.queryKey)
        });
        window.localStorage.setItem(storageKey, JSON.stringify({ savedAt: Date.now(), state }));
      } catch {
        // Storage may be disabled or full; the normal in-memory cache still works.
      }
    }, 250);
  });
  return () => {
    clearTimeout(timer);
    unsubscribe();
  };
}
