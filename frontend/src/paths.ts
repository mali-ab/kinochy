const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH || process.env.APP_BASE_PATH || '/';
const apiOrigin = String(
  process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:4000' : '')
).replace(/\/$/, '');

export const appBasePath = normalizeBasePath(rawBasePath);

export function withBasePath(path: string): string {
  if (!path || typeof path !== 'string') return path;
  if (apiOrigin && (path.startsWith('/api/') || path.startsWith('/media/'))) return `${apiOrigin}${path}`;
  if (!appBasePath) return path;
  if (/^(https?:|data:|blob:|#)/i.test(path)) return path;
  if (!path.startsWith('/')) return path;
  if (path === appBasePath || path.startsWith(`${appBasePath}/`)) return path;
  return `${appBasePath}${path}`;
}

function normalizeBasePath(value: string): string {
  const clean = String(value || '/').trim();
  if (!clean || clean === '/') return '';
  return `/${clean.replace(/^\/+|\/+$/g, '')}`;
}
