import type { NextConfig } from 'next';

const basePath = normalizeBasePath(process.env.APP_BASE_PATH ?? process.env.NEXT_PUBLIC_BASE_PATH ?? '');
const apiOrigin = (process.env.API_ORIGIN ?? 'http://localhost:5000').replace(/\/+$/, '');

const config: NextConfig = {
  basePath,
  poweredByHeader: false,
  reactStrictMode: true,
  trailingSlash: false,
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 604800
  },
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${apiOrigin}/api/:path*` },
      { source: '/media/:path*', destination: `${apiOrigin}/media/:path*` }
    ];
  }
};

function normalizeBasePath(value: string): string {
  const clean = value.trim().replace(/^\/+|\/+$/g, '');
  return clean ? `/${clean}` : '';
}

export default config;
