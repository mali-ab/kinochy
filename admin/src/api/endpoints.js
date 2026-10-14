import { api } from './client';
import { publicGet } from './http';

// --- Public catalog (browser requests through the same-origin proxy) ---

export function getMovies(search = '', options) {
  return publicGet(`/api/movies?search=${encodeURIComponent(search)}`, options);
}

export function getGenres(options) {
  return publicGet('/api/genres', options);
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
  return api('/api/auth/me').then((data) => data.admin ?? null);
}

export function login(payload) {
  return api('/api/users/login', { method: 'POST', body: JSON.stringify(payload) });
}

export function logout() {
  return api('/api/users/logout', { method: 'POST', body: JSON.stringify({}) });
}

// --- Admin (browser-only) ---

export function adminLogin(payload) {
  return api('/api/auth/login', { method: 'POST', body: JSON.stringify(payload) });
}

export function adminLogout() {
  return api('/api/auth/logout', { method: 'POST', body: JSON.stringify({}) });
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

export function removeEpisode(seriesId, episodeId) {
  return api(`/api/admin/series/${seriesId}/episodes/${episodeId}`, { method: 'DELETE' });
}
