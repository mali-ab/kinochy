import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { messages } from './messages.js';
import { routing } from './routing';

/**
 * Server request config for next-intl. The [locale] URL segment resolved by
 * the middleware wins; the NEXT_LOCALE cookie backs the stored preference,
 * falling back to the routing default.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const localeCodes: readonly string[] = routing.locales;
  let locale = await requestLocale;
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value;

  // Ensure that a valid locale is used.
  if (!locale || !localeCodes.includes(locale)) {
    locale = cookieLocale && localeCodes.includes(cookieLocale) ? cookieLocale : routing.defaultLocale;
  }

  return {
    locale,
    messages: messages[locale as keyof typeof messages]
  };
});
