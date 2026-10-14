'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { changeLanguage as changeLanguageRequest } from '../api/endpoints';
import { parsePathname, rebuildPathname, safeLocale } from '../catalog/urls';
import { getLanguageOptions } from '../i18n/labels.js';
import { useOptionalSession } from './session.jsx';

export { fallbackLocale, getLanguageOptions, normalizeGenreCatalog } from '../i18n/labels.js';

const LocaleContext = createContext(null);
const localeStorageKey = 'kinochy_locale';

/**
 * The [locale] route segment is the source of truth and language switches
 * navigate to the localized URL. The server layout passes only the active
 * locale's messages, so the client never downloads the other languages'
 * bundles.
 * @param {{ children: import('react').ReactNode, initialLocale: 'tm' | 'en' | 'ru', messages: Record<string, unknown> }} props
 */
export function LocaleProvider({ children, initialLocale, messages }) {
  const session = useOptionalSession();
  const user = session?.user ?? null;
  const setUser = session?.setUser ?? null;
  const locale = safeLocale(initialLocale);
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const changeLanguage = useCallback(async (nextLocale) => {
    const target = safeLocale(nextLocale);
    if (target === locale) return;
    try {
      window.localStorage.setItem(localeStorageKey, target);
    } catch {}
    const search = typeof window === 'undefined' ? '' : window.location.search;
    router.replace(`${rebuildPathname(target, parsePathname(pathname))}${search}`);
    if (!user || !setUser) return;
    setSaving(true);
    try {
      const data = await changeLanguageRequest(target);
      setUser(data.user);
    } catch {
      // The navigation already happened; a failed profile sync is not fatal.
    } finally {
      setSaving(false);
    }
  }, [locale, pathname, router, user, setUser]);

  const value = useMemo(() => ({
    locale,
    setLocale: changeLanguage,
    saving,
    languageOptions: getLanguageOptions()
  }), [locale, changeLanguage, saving]);

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
    </NextIntlClientProvider>
  );
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error('useLocale must be used within LocaleProvider.');
  return context;
}
