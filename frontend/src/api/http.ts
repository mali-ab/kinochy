import { api, ApiError } from './client';
import { apiOrigin } from './config';

export type CacheOptions = { revalidate?: number | false; tags?: string[] };

async function responseError(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => ({}))) as { message?: string };
  return new ApiError(body.message || `Request failed: ${response.status}`);
}

/**
 * Public catalog reads. On the server the API origin is called directly through
 * the Next.js fetch cache; in the browser requests go through the same-origin proxy.
 */
export async function publicGet<T>(path: string, options: CacheOptions = {}): Promise<T> {
  if (typeof window !== 'undefined') return api<T>(path);
  const response = await fetch(`${apiOrigin}${path}`, { next: { revalidate: options.revalidate ?? 60, tags: options.tags } });
  if (!response.ok) throw await responseError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
