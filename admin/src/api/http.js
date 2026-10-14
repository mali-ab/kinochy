import { api } from './client';

/**
 * Public catalog reads. The admin app runs fully client-side, so these go
 * through the same-origin proxy exactly like the browser branch of the public
 * site; server-side cache options do not apply here.
 */
export function publicGet(path, _options) {
  return api(path);
}
