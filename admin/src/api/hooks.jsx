import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { normalizeSubtitleCues } from '../player/subtitleCues.js';
import { normalizeGenreCatalog } from '../ui/locale.jsx';
import * as endpoints from './endpoints';
import { countriesQuery, genresQuery, queryKeys, subtitlesQuery } from './queries';

// --- Catalog reads (subset of the public site's hooks used by the admin) ---

export function useGenres() {
  const query = useQuery(genresQuery());
  return useMemo(() => normalizeGenreCatalog(query.data ?? []), [query.data]);
}

export function useCountries() {
  const query = useQuery(countriesQuery());
  return query.data ?? [];
}

export function useSubtitles(slug) {
  const en = useQuery({ ...subtitlesQuery(slug, 'en'), enabled: Boolean(slug) });
  const ru = useQuery({ ...subtitlesQuery(slug, 'ru'), enabled: Boolean(slug) });
  return {
    subtitles: { en: normalizeSubtitleCues(en.data ?? []), ru: normalizeSubtitleCues(ru.data ?? []) },
    ready: !en.isPending && !ru.isPending
  };
}

// --- Admin mutations ---

export function useDeleteUsers() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids) => endpoints.deleteUsers(ids),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.adminUsers });
      const previous = queryClient.getQueryData(queryKeys.adminUsers);
      queryClient.setQueryData(queryKeys.adminUsers, (current) => (current ?? []).filter((user) => !ids.includes(user.id)));
      return { previous };
    },
    onError: (_error, _ids, context) => {
      if (context) queryClient.setQueryData(queryKeys.adminUsers, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers })
  });
}

export function useDeleteMovie() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => endpoints.deleteMovie(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['movies'] });
      queryClient.invalidateQueries({ queryKey: ['movie'] });
    }
  });
}

export function useAddEpisode(seriesId, slug) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => endpoints.addEpisode(seriesId, payload),
    onSuccess: (seasons) => {
      queryClient.setQueryData(queryKeys.seasons(slug), seasons);
    }
  });
}

export function useAddSeason(seriesId, slug) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => endpoints.addSeason(seriesId, payload),
    onSuccess: (seasons) => queryClient.setQueryData(queryKeys.seasons(slug), seasons)
  });
}

export function useRemoveSeason(seriesId, slug) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (seasonNumber) => endpoints.removeSeason(seriesId, seasonNumber),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.seasons(slug) })
  });
}

export function useRemoveEpisode(seriesId, slug) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (episodeId) => endpoints.removeEpisode(seriesId, episodeId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.seasons(slug) })
  });
}
