import { createContext, useContext } from 'react';
import { IntlProvider } from 'use-intl';
import { messages } from '../i18n/messages.js';

export { fallbackLocale, translateGenre, normalizeGenreCatalog, translateAccent, translateDifficulty } from '../i18n/labels.js';

const LocaleContext = createContext(null);
/**
 * The administration workspace is intentionally English-only. Movie content
 * can still be entered in every supported language in the editor.
 * @param {{ children: import('react').ReactNode }} props
 */
export function LocaleProvider({ children }) {
  const locale = 'en';

  return (
    <IntlProvider locale={locale} messages={messages[locale]}>
      <LocaleContext.Provider value={{ locale }}>{children}</LocaleContext.Provider>
    </IntlProvider>
  );
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error('useLocale must be used within LocaleProvider.');
  return context;
}
