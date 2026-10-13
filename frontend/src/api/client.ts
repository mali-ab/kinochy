import { withBasePath } from '../paths';

export type ApiOptions = RequestInit;

export class ApiError extends Error {
  code?: string;
  email?: string;
}

export async function api<T = any>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(withBasePath(path), {
    credentials: 'include',
    ...options,
    headers
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { message?: string; code?: string; email?: string };
    const error = new ApiError(body.message || `Request failed: ${response.status}`);
    error.code = body.code;
    error.email = body.email;
    throw error;
  }

  if (response.status === 204) return undefined as T;
  return response.json();
}

type UploadOptions = {
  method?: string;
  body: FormData;
  headers?: Record<string, string>;
  onProgress?: (progress: number) => void;
};

export function apiUpload<T = any>(path: string, { method = 'POST', body, headers = {}, onProgress }: UploadOptions): Promise<T> {
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
      let responseBody: unknown = {};
      try { responseBody = JSON.parse(text); } catch { /* Proxies may return an HTML error page. */ }
      if (request.status >= 200 && request.status < 300) {
        resolve(responseBody as T);
        return;
      }
      const body = responseBody && typeof responseBody === 'object'
        ? responseBody as { message?: string; code?: string; email?: string }
        : {};
      const error = new ApiError(body.message || `Request failed: ${request.status}`);
      error.code = body.code;
      error.email = body.email;
      reject(error);
    };

    request.onerror = () => reject(new Error('Network error'));
    request.send(body);
  });
}

export const moviePosterFallback = (_movie?: unknown): string =>
  `linear-gradient(150deg, rgba(16, 185, 129, .24), rgba(14, 165, 233, .18)), radial-gradient(circle at 45% 24%, rgba(255, 200, 62, .8), transparent 24%), linear-gradient(180deg, #26353c, #101214 70%)`;
