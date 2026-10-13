import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './src/i18n/routing';
import { categoryKeys, categorySegment } from './src/catalog/urls';

/**
 * Localizes public site URLs (/ru/filmy -> [locale=ru]/movies) and negotiates
 * the locale prefix. Admin, API and media paths stay untouched.
 */

// Legacy /?category=… home URLs from before the path-based catalog routes.
const legacyCategorySegments: Partial<Record<string, string>> = Object.fromEntries(
  categoryKeys.map((key) => [key, categorySegment(key, 'tm')])
);

function redirectLegacyCategory(request: NextRequest) {
  if (request.nextUrl.pathname !== '/') return null;
  const segment = legacyCategorySegments[request.nextUrl.searchParams.get('category') ?? ''];
  if (!segment) return null;
  const url = request.nextUrl.clone();
  url.searchParams.delete('category');
  url.pathname = `/${segment}`;
  return NextResponse.redirect(url, 308);
}

export default function middleware(request: NextRequest) {
  return redirectLegacyCategory(request) ?? createMiddleware(routing)(request);
}

export const config = {
  matcher: ['/((?!api|media|admin|_next|_vercel|.*\\..*).*)']
};
