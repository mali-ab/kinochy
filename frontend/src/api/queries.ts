import { queryOptions } from '@tanstack/react-query';
import * as endpoints from './endpoints';

export const queryKeys = {
  movies: (search = '') => ['movies', search] as const,
  genres: ['genres'] as const,
  countries: ['countries'] as const,
  movie: (slug: string) => ['movie', slug] as const,
  recommendations: (slug: string) => ['movies', slug, 'recommendations'] as const,
  seasons: (slug: string) => ['movies', slug, 'seasons'] as const,
  comments: (slug: string) => ['movies', slug, 'comments'] as const,
  subtitles: (slug: string) => ['subtitles', slug] as const,
  translate: (text: string) => ['translate', text] as const,
  favorites: ['users', 'favorites'] as const,
  favorite: (movieId: string) => ['users', 'favorites', movieId] as const,
  favoritesList: ['users', 'favorites', 'list'] as const,
  favoriteIds: ['users', 'favorites', 'ids'] as const,
  vocabulary: ['users', 'vocabulary'] as const,
  viewer: ['users', 'me'] as const,
  adminSession: ['auth', 'me'] as const,
  adminMovie: (id: string) => ['admin', 'movies', id] as const,
  adminUser: (id: string) => ['admin', 'users', id] as const,
  adminUsers: ['admin', 'users'] as const
};

export function moviesQuery(search = '') {
  return queryOptions({ queryKey: queryKeys.movies(search), queryFn: () => endpoints.getMovies(search), staleTime: 5 * 60_000 });
}

export function genresQuery() {
  return queryOptions({ queryKey: queryKeys.genres, queryFn: () => endpoints.getGenres(), staleTime: 10 * 60_000 });
}

export function countriesQuery() {
  return queryOptions({ queryKey: queryKeys.countries, queryFn: () => endpoints.getCountries(), staleTime: 24 * 60 * 60_000 });
}

export function movieQuery(slug: string) {
  return queryOptions({ queryKey: queryKeys.movie(slug), queryFn: () => endpoints.getMovie(slug), staleTime: 5 * 60_000 });
}

export function recommendationsQuery(slug: string) {
  return queryOptions({ queryKey: queryKeys.recommendations(slug), queryFn: () => endpoints.getRecommendations(slug), staleTime: 5 * 60_000 });
}

export function seasonsQuery(slug: string) {
  return queryOptions({ queryKey: queryKeys.seasons(slug), queryFn: () => endpoints.getSeasons(slug), staleTime: 60_000 });
}

export function commentsQuery(slug: string) {
  return queryOptions({ queryKey: queryKeys.comments(slug), queryFn: () => endpoints.getComments(slug), staleTime: 30_000 });
}

export function subtitlesQuery(slug: string, language: 'en' | 'ru') {
  return queryOptions({ queryKey: [...queryKeys.subtitles(slug), language], queryFn: () => endpoints.getSubtitles(slug, language), staleTime: Infinity });
}

export function translateQuery(text: string) {
  return queryOptions({ queryKey: queryKeys.translate(text), queryFn: () => endpoints.translateText(text), staleTime: Infinity });
}

export function favoriteIdsQuery() {
  return queryOptions({ queryKey: queryKeys.favoriteIds, queryFn: () => endpoints.getFavoriteIds(), staleTime: 60_000 });
}

export function favoritesListQuery() {
  return queryOptions({ queryKey: queryKeys.favoritesList, queryFn: () => endpoints.getFavorites(), staleTime: 60_000 });
}

export function favoriteQuery(movieId: string) {
  return queryOptions({ queryKey: queryKeys.favorite(movieId), queryFn: () => endpoints.getFavorite(movieId), staleTime: 60_000 });
}

export function vocabularyQuery() {
  return queryOptions({ queryKey: queryKeys.vocabulary, queryFn: () => endpoints.getVocabulary(), staleTime: 60_000 });
}

export function viewerQuery() {
  return queryOptions({ queryKey: queryKeys.viewer, queryFn: () => endpoints.getCurrentUser(), staleTime: 5 * 60_000 });
}

export function adminSessionQuery() {
  return queryOptions({ queryKey: queryKeys.adminSession, queryFn: () => endpoints.getCurrentAdmin(), staleTime: 5 * 60_000 });
}

export function adminMovieQuery(id: string) {
  return queryOptions({ queryKey: queryKeys.adminMovie(id), queryFn: () => endpoints.getAdminMovie(id), staleTime: 0 });
}

export function adminUserQuery(id: string) {
  return queryOptions({ queryKey: queryKeys.adminUser(id), queryFn: () => endpoints.getAdminUser(id), staleTime: 0 });
}

export function adminUsersQuery() {
  return queryOptions({ queryKey: queryKeys.adminUsers, queryFn: () => endpoints.getAdminUsers(), staleTime: 0 });
}
