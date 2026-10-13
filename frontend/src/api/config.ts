export const apiOrigin = (process.env.API_ORIGIN ?? 'http://192.168.137.102:4000').replace(/\/+$/, '');

export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:5173').replace(/\/+$/, '');
