import { queryOptions } from '@tanstack/react-query';
import * as endpoints from './endpoints';

export const queryKeys = {
  movies: (search = '') => ['movies', search],
  genres: ['genres'],
  movie: (slug) => ['movie', slug],
  recommendations: (slug) => ['movies', slug, 'recommendations'],
  seasons: (slug) => ['movies', slug, 'seasons'],
  comments: (slug) => ['movies', slug, 'comments'],
  subtitles: (slug) => ['subtitles', slug],
  translate: (text) => ['translate', text],
  viewer: ['users', 'me'],
  adminSession: ['auth', 'me'],
  adminMovie: (id) => ['admin', 'movies', id],
  adminUser: (id) => ['admin', 'users', id],
  adminUsers: ['admin', 'users']
};

export function moviesQuery(search = '') {
  return queryOptions({ queryKey: queryKeys.movies(search), queryFn: () => endpoints.getMovies(search), staleTime: 60_000 });
}

export function genresQuery() {
  return queryOptions({ queryKey: queryKeys.genres, queryFn: () => endpoints.getGenres(), staleTime: 10 * 60_000 });
}

export function movieQuery(slug) {
  return queryOptions({ queryKey: queryKeys.movie(slug), queryFn: () => endpoints.getMovie(slug), staleTime: 60_000 });
}

export function seasonsQuery(slug) {
  return queryOptions({ queryKey: queryKeys.seasons(slug), queryFn: () => endpoints.getSeasons(slug), staleTime: 60_000 });
}

export function subtitlesQuery(slug, language) {
  return queryOptions({ queryKey: [...queryKeys.subtitles(slug), language], queryFn: () => endpoints.getSubtitles(slug, language), staleTime: Infinity });
}

export function translateQuery(text) {
  return queryOptions({ queryKey: queryKeys.translate(text), queryFn: () => endpoints.translateText(text), staleTime: Infinity });
}

export function adminSessionQuery() {
  return queryOptions({ queryKey: queryKeys.adminSession, queryFn: () => endpoints.getCurrentAdmin(), staleTime: 5 * 60_000 });
}

export function adminMovieQuery(id) {
  return queryOptions({ queryKey: queryKeys.adminMovie(id), queryFn: () => endpoints.getAdminMovie(id), staleTime: 0 });
}

export function adminUserQuery(id) {
  return queryOptions({ queryKey: queryKeys.adminUser(id), queryFn: () => endpoints.getAdminUser(id), staleTime: 0 });
}

export function adminUsersQuery() {
  return queryOptions({ queryKey: queryKeys.adminUsers, queryFn: () => endpoints.getAdminUsers(), staleTime: 0 });
}
