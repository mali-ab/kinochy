import { api } from './client';
import { publicGet, type CacheOptions } from './http';
import type { AdminIdentity, Genre, Movie, MovieComment, SeriesSeason, SessionUser, TranslateResult, VocabularyEntry } from './types';

// --- Public catalog (isomorphic: cached on the server, proxied in the browser) ---

export function getMovies(search = '', options?: CacheOptions) {
  return publicGet<Movie[]>(`/api/movies?search=${encodeURIComponent(search)}`, options);
}

export function getGenres(options?: CacheOptions) {
  return publicGet<Genre[]>('/api/genres', options);
}

export function getCountries(options?: CacheOptions) {
  return publicGet<Country[]>('/api/countries', options);
}

export function getMovie(slug: string, options?: CacheOptions) {
  return publicGet<Movie>(`/api/movies/${encodeURIComponent(slug)}`, options);
}

export function getRecommendations(slug: string, options?: CacheOptions) {
  return publicGet<Movie[]>(`/api/movies/${encodeURIComponent(slug)}/recommendations`, options);
}

export function getSeasons(slug: string, options?: CacheOptions) {
  return publicGet<SeriesSeason[]>(`/api/movies/${encodeURIComponent(slug)}/seasons`, options);
}

export function getComments(slug: string, options?: CacheOptions) {
  return publicGet<MovieComment[]>(`/api/movies/${encodeURIComponent(slug)}/comments`, options);
}

export function getSubtitles(slug: string, language: 'en' | 'ru', options?: CacheOptions) {
  return publicGet(`/api/movies/${encodeURIComponent(slug)}/subtitles/${language}`, options);
}

export function translateText(text: string, from = 'en', to = 'ru') {
  return api<TranslateResult>(`/api/translate?text=${encodeURIComponent(text)}&from=${from}&to=${to}`);
}

// --- Session (browser-only: cookie credentials) ---

export function getCurrentUser() {
  return api<{ user: SessionUser | null }>('/api/users/me').then((data) => data.user ?? null);
}

export function getCurrentAdmin() {
  return getCurrentUser().then((user) => user?.role === 'admin' ? { id: user.id, email: user.email } : null);
}

export function login(payload: { email: string; password: string }) {
  return api<{ user: SessionUser }>('/api/users/login', { method: 'POST', body: JSON.stringify(payload) });
}

export function signup(payload: { username: string; email: string; password: string }) {
  return api<{ pending: { email: string; username?: string; verificationCode: string } }>('/api/users/signup', { method: 'POST', body: JSON.stringify(payload) });
}

export function verifyEmail(payload: { email: string; code: string }) {
  return api<{ user: SessionUser }>('/api/users/verify-email', { method: 'POST', body: JSON.stringify(payload) });
}

export function resendVerification(email: string) {
  return api<{ pending: { email: string; verificationCode: string } }>('/api/users/resend-verification', { method: 'POST', body: JSON.stringify({ email }) });
}

export function forgotPassword(email: string) {
  return api<{ pending: { email: string; verificationCode: string } }>('/api/users/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
}

export function verifyPasswordReset(payload: { email: string; code: string }) {
  return api<{ ok: boolean }>('/api/users/verify-password-reset', { method: 'POST', body: JSON.stringify(payload) });
}

export function resetPassword(payload: { email: string; code: string; password: string }) {
  return api<{ ok: boolean }>('/api/users/reset-password', { method: 'POST', body: JSON.stringify(payload) });
}

export function logout() {
  return api<{ ok: boolean }>('/api/users/logout', { method: 'POST', body: JSON.stringify({}) });
}

export function changeLanguage(language: string) {
  return api<{ user: SessionUser }>('/api/users/language', { method: 'PATCH', body: JSON.stringify({ language }) });
}

// --- Favorites + vocabulary (browser-only) ---

export function getFavoriteIds() {
  return api<string[]>('/api/users/favorites/ids');
}

export function getFavorites() {
  return api<Movie[]>('/api/users/favorites');
}

export function getFavorite(movieId: string) {
  return api<{ favorite: boolean }>(`/api/users/favorites/${movieId}`);
}

export function setFavorite(movieId: string, favorite: boolean) {
  return api<{ favorite: boolean }>(`/api/users/favorites/${movieId}`, { method: favorite ? 'POST' : 'DELETE', body: JSON.stringify({}) }).then((data) => ({ favorite: Boolean(data.favorite) }));
}

export function getVocabulary() {
  return api<VocabularyEntry[]>('/api/users/vocabulary');
}

export function addVocabularyWord(payload: { word: string; translation: string; sourceLanguage: string; targetLanguage: string }) {
  return api<VocabularyEntry>('/api/users/vocabulary', { method: 'POST', body: JSON.stringify(payload) });
}

export function removeVocabularyWord(id: string) {
  return api<{ ok: boolean }>(`/api/users/vocabulary/${id}`, { method: 'DELETE' });
}

// --- Comments ---

export function addComment(slug: string, body: string) {
  return api<MovieComment>(`/api/movies/${encodeURIComponent(slug)}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
}

export function removeComment(slug: string, id: string) {
  return api<{ ok: boolean }>(`/api/movies/${encodeURIComponent(slug)}/comments/${id}`, { method: 'DELETE' });
}
