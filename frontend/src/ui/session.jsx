'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useMemo } from 'react';
import { adminSessionQuery, queryKeys, viewerQuery } from '../api/queries';

const SessionContext = createContext(null);

/**
 * Session state lives in the TanStack Query cache so logins, logouts and
 * language changes update every consumer at once.
 */
export function SessionProvider({ children }) {
  const queryClient = useQueryClient();
  const userQuery = useQuery({ ...viewerQuery(), retry: false });
  const adminQuery = useQuery({ ...adminSessionQuery(), retry: false });

  const value = useMemo(
    () => ({
      user: userQuery.data ?? null,
      setUser: (next) => queryClient.setQueryData(queryKeys.viewer, next),
      admin: adminQuery.data ?? null,
      setAdmin: (next) => queryClient.setQueryData(queryKeys.adminSession, next),
      checking: userQuery.isPending || adminQuery.isPending
    }),
    [userQuery.data, userQuery.isPending, adminQuery.data, adminQuery.isPending, queryClient]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used within a SessionProvider.');
  return context;
}

/** Returns null instead of throwing when no SessionProvider is mounted (admin module). */
export function useOptionalSession() {
  return useContext(SessionContext);
}
