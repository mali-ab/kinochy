'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { changeLanguage as changeLanguageRequest } from '../api/endpoints';
import { parsePathname, rebuildPathname, safeLocale } from '../catalog/urls';
import { useOptionalSession } from './session.jsx';

export { fallbackLocale, t, getLanguageOptions, translateGenre, normalizeGenreCatalog, translateAccent, translateDifficulty } from './translations.js';

import { t as translate, getLanguageOptions } from './translations.js';

const LocaleContext = createContext(null);
const localeStorageKey = 'kinochy_locale';

/**
 * On the public site the [locale] route segment is the source of truth and
 * language switches navigate to the localized URL. The admin panel has no
 * URL locale, so it keeps the stored preference.
 * @param {{ children: import('react').ReactNode, initialLocale?: 'tm' | 'en' | 'ru' }} props
 */
export function LocaleProvider({ children, initialLocale }) {
  const session = useOptionalSession();
  const user = session?.user ?? null;
  const setUser = session?.setUser ?? null;
  const [locale, setLocaleState] = useState(() => safeLocale(initialLocale));
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (initialLocale) {
      setLocaleState(safeLocale(initialLocale));
      return;
    }
    try {
      setLocaleState(safeLocale(window.localStorage.getItem(localeStorageKey)));
    } catch {}
  }, [initialLocale]);

  const changeLanguage = useCallback(async (nextLocale) => {
    const target = safeLocale(nextLocale);
    if (target === locale) return;
    try {
      window.localStorage.setItem(localeStorageKey, target);
    } catch {}
    if (initialLocale) {
      const search = typeof window === 'undefined' ? '' : window.location.search;
      router.replace(`${rebuildPathname(target, parsePathname(pathname))}${search}`);
    } else {
      setLocaleState(target);
    }
    if (!user || !setUser) return;
    setSaving(true);
    try {
      const data = await changeLanguageRequest(target);
      setUser(data.user);
    } catch {
      // The navigation/switch already happened; a failed profile sync is not fatal.
    } finally {
      setSaving(false);
    }
  }, [initialLocale, locale, pathname, router, user, setUser]);

  const value = useMemo(() => ({
    locale,
    setLocale: changeLanguage,
    saving,
    t: (key) => translate(locale, key),
    languageOptions: getLanguageOptions()
  }), [locale, changeLanguage, saving]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error('useLocale must be used within LocaleProvider.');
  return context;
}
