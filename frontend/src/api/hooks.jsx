'use client';

import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { normalizeSubtitleCues } from '../player/subtitleCues.js';
import { normalizeGenreCatalog } from '../ui/locale.jsx';
import * as endpoints from './endpoints';
import { commentsQuery, favoriteIdsQuery, favoriteQuery, favoritesListQuery, genresQuery, movieQuery, moviesQuery, queryKeys, recommendationsQuery, seasonsQuery, subtitlesQuery, translateQuery, viewerQuery, vocabularyQuery } from './queries';

// --- Catalog reads ---

export function useMovies(search = '') {
  const query = useQuery(moviesQuery(search));
  return { movies: query.data ?? [], loading: query.isPending, refreshing: query.isFetching && !query.isPending };
}

export function useGenres() {
  const query = useQuery(genresQuery());
  return useMemo(() => normalizeGenreCatalog(query.data ?? []), [query.data]);
}

export function useMovie(slug) {
  const query = useQuery({ ...movieQuery(slug), retry: false });
  return { movie: query.data ?? null, loading: query.isPending };
}

export function useRecommendations(slug) {
  const query = useQuery(recommendationsQuery(slug));
  return query.data ?? [];
}

export function useSeasons(slug) {
  const query = useQuery(seasonsQuery(slug));
  return query.data ?? [];
}

export function useComments(slug) {
  const query = useQuery(commentsQuery(slug));
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

export function useWordTranslations(words) {
  const queries = useQueries({ queries: (words ?? []).map((word) => translateQuery(word)) });
  return useMemo(() => {
    const translations = {};
    queries.forEach((query, index) => {
      if (query.data?.translation) translations[words[index]] = query.data.translation;
    });
    return translations;
  }, [queries, words]);
}

// --- Session-scoped reads ---

export function useFavoriteIds() {
  const query = useQuery({ ...favoriteIdsQuery(), retry: false });
  return query.data ?? [];
}

export function useFavorites() {
  const query = useQuery({ ...favoritesListQuery(), retry: false });
  return { favorites: query.data ?? [], loading: query.isPending };
}

export function useFavoriteStatus(movieId) {
  const query = useQuery({ ...favoriteQuery(movieId), enabled: Boolean(movieId), retry: false });
  return { favorite: query.data?.favorite === true };
}

export function useViewer() {
  const query = useQuery({ ...viewerQuery(), retry: false });
  return query.data ?? null;
}

export function useVocabulary() {
  const query = useQuery({ ...vocabularyQuery(), retry: false });
  return { words: query.data ?? [], loading: query.isPending };
}

// --- Mutations ---

export function useToggleFavorite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ movieId, nextFavorite }) => endpoints.setFavorite(movieId, nextFavorite),
    onMutate: async ({ movieId, nextFavorite }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.favorites });
      const key = queryKeys.favorite(movieId);
      const previous = queryClient.getQueryData(key);
      queryClient.setQueryData(key, { favorite: nextFavorite });
      return { key, previous };
    },
    onError: (_error, _variables, context) => {
      if (context) queryClient.setQueryData(context.key, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.favorites })
  });
}

export function useAddComment(slug) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body) => endpoints.addComment(slug, body),
    onSuccess: (comment) => {
      queryClient.setQueryData(queryKeys.comments(slug), (current) => [comment, ...(current ?? [])].slice(0, 50));
    }
  });
}

export function useRemoveComment(slug) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => endpoints.removeComment(slug, id),
    onSuccess: (_data, id) => {
      queryClient.setQueryData(queryKeys.comments(slug), (current) => (current ?? []).filter((comment) => comment.id !== id));
    }
  });
}

export function useSaveVocabularyWord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => endpoints.addVocabularyWord(payload),
    onSuccess: (entry) => {
      queryClient.setQueryData(queryKeys.vocabulary, (current) => (current ? [entry, ...current] : [entry]));
    }
  });
}

export function useRemoveVocabularyWord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => endpoints.removeVocabularyWord(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.vocabulary });
      const previous = queryClient.getQueryData(queryKeys.vocabulary);
      queryClient.setQueryData(queryKeys.vocabulary, (current) => (current ?? []).filter((entry) => entry.id !== id));
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context) queryClient.setQueryData(queryKeys.vocabulary, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.vocabulary })
  });
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

export function useRemoveEpisode(seriesId, slug) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (episodeId) => endpoints.removeEpisode(seriesId, episodeId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.seasons(slug) })
  });
}
