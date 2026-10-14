import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { IntlProvider } from 'use-intl';
import { safeLocale } from '../catalog/urls';
import { messages } from '../i18n/messages.js';

export { fallbackLocale, translateGenre, normalizeGenreCatalog, translateAccent, translateDifficulty } from '../i18n/labels.js';

const LocaleContext = createContext(null);
const localeStorageKey = 'kinochy_locale';

/**
 * Admin locale provider. The admin panel has no URL locale segment, so it
 * follows the preference stored by the public site (kinochy_locale) and
 * renders the full message map through use-intl so language switches need no
 * navigation or refetch.
 * @param {{ children: import('react').ReactNode }} props
 */
export function LocaleProvider({ children }) {
  const [locale, setLocale] = useState(() => safeLocale(undefined));

  useEffect(() => {
    try {
      setLocale(safeLocale(window.localStorage.getItem(localeStorageKey)));
    } catch {}
  }, []);

  const value = useMemo(() => ({ locale }), [locale]);

  return (
    <IntlProvider locale={locale} messages={messages[locale]}>
      <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
    </IntlProvider>
  );
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error('useLocale must be used within LocaleProvider.');
  return context;
}
