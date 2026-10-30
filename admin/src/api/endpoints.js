import { api } from './client';
import { publicGet } from './http';

// --- Public catalog (browser requests through the same-origin proxy) ---

export async function getMovies(search = '', options) {
  const movies = [];
  let page = 1;
  while (true) {
    const result = await publicGet(`/api/catalog?search=${encodeURIComponent(search)}&page=${page}&pageSize=100`, options);
    movies.push(...result.items);
    if (!result.hasNextPage) return movies;
    page += 1;
  }
}

export function getGenres(options) {
  return publicGet('/api/genres', options);
}

export function getCountries(options) {
  return publicGet('/api/countries', options);
}

export function getMovie(slug, options) {
  return publicGet(`/api/movies/${encodeURIComponent(slug)}`, options);
}

export function getRecommendations(slug, options) {
  return publicGet(`/api/movies/${encodeURIComponent(slug)}/recommendations`, options);
}

export function getSeasons(slug, options) {
  return publicGet(`/api/movies/${encodeURIComponent(slug)}/seasons`, options);
}

export function getComments(slug, options) {
  return publicGet(`/api/movies/${encodeURIComponent(slug)}/comments`, options);
}

export function getSubtitles(slug, language, options) {
  return publicGet(`/api/movies/${encodeURIComponent(slug)}/subtitles/${language}`, options);
}

export function translateText(text, from = 'en', to = 'ru') {
  return api(`/api/translate?text=${encodeURIComponent(text)}&from=${from}&to=${to}`);
}

// --- Session ---

export function getCurrentUser() {
  return api('/api/users/me').then((data) => data.user ?? null);
}

export function getCurrentAdmin() {
  return getCurrentUser().then((user) => user?.role?.toLowerCase() === 'admin' ? user : null);
}

export function login(payload) {
  return api('/api/users/login', { method: 'POST', body: JSON.stringify(payload) });
}

export function logout() {
  return api('/api/users/logout', { method: 'POST', body: JSON.stringify({}) });
}

// --- Admin (browser-only) ---

export async function adminLogin(payload) {
  const data = await api('/api/users/login', { method: 'POST', body: JSON.stringify(payload) });
  if (data.user?.role?.toLowerCase() !== 'admin') {
    await api('/api/users/logout', { method: 'POST', body: JSON.stringify({}) });
    throw new Error('Administrator account required');
  }
  return { admin: data.user };
}

export function adminLogout() {
  return api('/api/users/logout', { method: 'POST', body: JSON.stringify({}) });
}

export function getAdminMovie(id) {
  return api(`/api/admin/movies/${id}`);
}

export function deleteMovie(id) {
  return api(`/api/admin/movies/${id}`, { method: 'DELETE', body: JSON.stringify({}) });
}

export function getAdminUsers() {
  return api('/api/admin/users');
}

export function getAdminUser(id) {
  return api(`/api/admin/users/${id}`);
}

export function createUser(payload) {
  return api('/api/admin/users', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateUser(id, payload) {
  return api(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function deleteUsers(ids) {
  return api('/api/admin/users', { method: 'DELETE', body: JSON.stringify({ ids }) });
}

export function addEpisode(seriesId, payload) {
  return api(`/api/admin/series/${seriesId}/episodes`, { method: 'POST', body: JSON.stringify(payload) });
}

export function addSeason(seriesId, payload) {
  return api(`/api/admin/series/${seriesId}/seasons`, { method: 'POST', body: JSON.stringify(payload) });
}

export function removeSeason(seriesId, seasonNumber) {
  return api(`/api/admin/series/${seriesId}/seasons/${seasonNumber}`, { method: 'DELETE' });
}

export function removeEpisode(seriesId, episodeId) {
  return api(`/api/admin/series/${seriesId}/episodes/${episodeId}`, { method: 'DELETE' });
}

export function getAdminComments({ page = 1, pageSize = 25, search = '', movieId = '' } = {}) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (search) params.set('search', search);
  if (movieId) params.set('movieId', movieId);
  return api(`/api/admin/comments?${params}`);
}

export function deleteAdminComment(id) {
  return api(`/api/admin/comments/${id}`, { method: 'DELETE' });
}

export function scanMediaLibrary(path) {
  return api('/api/admin/media-library/scan', { method: 'POST', body: JSON.stringify({ path }) });
}
