import { withBasePath } from '../paths';

export class ApiError extends Error {
  code;
  email;
}

export async function api(path, options = {}) {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(withBasePath(path), {
    credentials: 'include',
    ...options,
    headers
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new ApiError(body.message || `Request failed: ${response.status}`);
    error.code = body.code;
    error.email = body.email;
    throw error;
  }

  if (response.status === 204) return undefined;
  return response.json();
}

export function apiUpload(path, { method = 'POST', body, headers = {}, onProgress }) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(method, withBasePath(path), true);
    request.withCredentials = true;

    Object.entries(headers).forEach(([key, value]) => request.setRequestHeader(key, value));

    request.upload.onprogress = (event) => {
      if (!onProgress || !event.lengthComputable) return;
      onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };

    request.onload = () => {
      const text = request.responseText || '{}';
      let responseBody = {};
      try { responseBody = JSON.parse(text); } catch { /* Proxies may return an HTML error page. */ }
      if (request.status >= 200 && request.status < 300) {
        resolve(responseBody);
        return;
      }
      const body = responseBody && typeof responseBody === 'object' ? responseBody : {};
      const error = new ApiError(body.message || `Request failed: ${request.status}`);
      error.code = body.code;
      error.email = body.email;
      reject(error);
    };

    request.onerror = () => reject(new Error('Network error'));
    request.send(body);
  });
}

export const moviePosterFallback = (_movie) =>
  `linear-gradient(150deg, rgba(16, 185, 129, .24), rgba(14, 165, 233, .18)), radial-gradient(circle at 45% 24%, rgba(255, 200, 62, .8), transparent 24%), linear-gradient(180deg, #26353c, #101214 70%)`;
