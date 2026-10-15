import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { apiOrigin } from './src/api/config';

// Points the plugin at the next-intl request config.
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const basePath = normalizeBasePath(process.env.APP_BASE_PATH ?? process.env.NEXT_PUBLIC_BASE_PATH ?? '');

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

export default withNextIntl(config);
