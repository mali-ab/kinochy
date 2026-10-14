import { defineRouting } from 'next-intl/routing';

/**
 * Locale-aware routing shared by the middleware. Mirrors the URL structure in
 * src/catalog/urls.ts — the category segment is translated per locale while
 * genre and movie slugs stay locale-independent Latin segments.
 */
export const routing = defineRouting({
  locales: ['tm', 'en', 'ru'],
  defaultLocale: 'tm',
  // The default locale (tm) is served without a prefix, like the multilang starter.
  localePrefix: 'as-needed',
  localeDetection: false,
  pathnames: {
    '/': '/',
    // The default locale (tm) reuses the canonical Latin spellings unprefixed;
    // en adds the /en prefix and ru uses translated segments.
    '/movies': { tm: '/kinolar', en: '/movies', ru: '/filmy' },
    '/series': { tm: '/seriallar', en: '/series', ru: '/serialy' },
    '/cartoons': { tm: '/multifilmler', en: '/cartoons', ru: '/multfilmy' },
    '/movies/[genre]': { tm: '/kinolar/[genre]', en: '/movies/[genre]', ru: '/filmy/[genre]' },
    '/series/[genre]': { tm: '/seriallar/[genre]', en: '/series/[genre]', ru: '/serialy/[genre]' },
    '/cartoons/[genre]': { tm: '/multifilmler/[genre]', en: '/cartoons/[genre]', ru: '/multfilmy/[genre]' },
    '/movies/[genre]/[slug]': { tm: '/kinolar/[genre]/[slug]', en: '/movies/[genre]/[slug]', ru: '/filmy/[genre]/[slug]' },
    '/series/[genre]/[slug]': { tm: '/seriallar/[genre]/[slug]', en: '/series/[genre]/[slug]', ru: '/serialy/[genre]/[slug]' },
    '/cartoons/[genre]/[slug]': { tm: '/multifilmler/[genre]/[slug]', en: '/cartoons/[genre]/[slug]', ru: '/multfilmy/[genre]/[slug]' }
  }
});
