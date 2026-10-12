import type { NextConfig } from 'next';

const basePath = normalizeBasePath(process.env.APP_BASE_PATH ?? process.env.NEXT_PUBLIC_BASE_PATH ?? '');

const config: NextConfig = {
  output: 'export',
  basePath,
  assetPrefix: basePath || undefined,
  images: { unoptimized: true },
  poweredByHeader: false,
  reactStrictMode: true,
  trailingSlash: false
};

function normalizeBasePath(value: string): string {
  const clean = value.trim().replace(/^\/+|\/+$/g, '');
  return clean ? `/${clean}` : '';
}

export default config;
