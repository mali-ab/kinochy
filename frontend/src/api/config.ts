export const apiOrigin = (process.env.API_ORIGIN ?? 'http://192.168.137.102:5000').replace(/\/+$/, '');

export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:4000').replace(/\/+$/, '');

export function browserApiOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_API_ORIGIN?.replace(/\/+$/, '');
  if (configured) return configured;
  if (process.env.NODE_ENV !== 'development' || typeof window === 'undefined' || window.location.port !== '4000') return '';
  return `${window.location.protocol}//${window.location.hostname}:5000`;
}
