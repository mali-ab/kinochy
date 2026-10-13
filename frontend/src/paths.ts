const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH || process.env.APP_BASE_PATH || '/';

export const appBasePath = normalizeBasePath(rawBasePath);

export function withBasePath(path: string): string {
  if (!path || typeof path !== 'string') return path;
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
