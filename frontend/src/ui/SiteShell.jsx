'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { BookOpen, Check, ChevronDown, Clapperboard, Crown, Film, Globe2, Heart, LayoutDashboard, LoaderCircle, LogOut, Search, Tv } from 'lucide-react';
import { logout as logoutUser } from '../api/endpoints';
import { catalogUrl, categoryKeys, categoryLabelKey, homeUrl, parsePathname, withLocale } from '../catalog/urls';
import { LocaleProvider, useLocale } from './locale.jsx';
import { SessionProvider, useSession } from './session.jsx';

/**
 * Public site chrome. The locale comes from the [locale] route segment and
 * the layout passes only that locale's messages.
 * @param {{ locale: 'tm' | 'en' | 'ru', messages: Record<string, unknown>, children: import('react').ReactNode }} props
 */
export default function SiteShell({ locale, messages, children }) {
  return (
    <SessionProvider>
      <LocaleProvider initialLocale={locale} messages={messages}>
        <SiteChrome>{children}</SiteChrome>
      </LocaleProvider>
    </SessionProvider>
  );
}

function SiteChrome({ children }) {
  const [search, setSearch] = useState('');
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const languageRef = useRef(null);
  const { user, admin, setUser } = useSession();
  const { locale, setLocale, languageOptions, saving: languageSaving } = useLocale();
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const parsed = parsePathname(pathname);
  const isVocabulary = parsed.segments[0] === 'vocabulary';
  const isFavorites = parsed.segments[0] === 'favorites';
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!languageOpen) return undefined;

    function closeOnOutsidePress(event) {
      if (!languageRef.current?.contains(event.target)) setLanguageOpen(false);
    }

    function closeOnEscape(event) {
      if (event.key === 'Escape') setLanguageOpen(false);
    }

    document.addEventListener('pointerdown', closeOnOutsidePress);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [languageOpen]);

  function submitSearch(event) {
    event.preventDefault();
    router.push(`${homeUrl(locale)}?search=${encodeURIComponent(search)}`);
  }

  function changeLanguage(nextLocale) {
    setLanguageOpen(false);
    setLocale(nextLocale);
  }

  async function logout() {
    await logoutUser();
    setUser(null);
    setAdmin(null);
    queryClient.invalidateQueries({ queryKey: ['users'] });
    setConfirmLogout(false);
    router.push(homeUrl(locale));
  }

  return (
    <div className="app">
      {/* The static chrome (nav, search, language picker) renders on the server
          so crawlers see the localized category links; only the auth-dependent
          actions wait for the session check. */}
      <header className="topbar">
        <Link href={homeUrl(locale)} className="brand" aria-label="Kinochy home">
          <span className="brand-mark">
            <Image src="/kinochy_favicon.png" alt="" width={32} height={32} priority />
          </span>
          <span>Kinochy</span>
        </Link>

        <NavMenu activeCategory={parsed.category} locale={locale} user={user} t={t} isFavorites={isFavorites} isVocabulary={isVocabulary} />
        <form className="search" onSubmit={submitSearch}>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('search_placeholder')} />
          <button aria-label={t('search_label')}>
            <Search size={21} />
          </button>
        </form>
        <div ref={languageRef} className={`language-picker language-switch ${languageOpen ? 'open' : ''}`}>
          <button type="button" className="language-switch-trigger" onClick={() => setLanguageOpen((value) => !value)} aria-label={t('language_label')} aria-haspopup="menu" aria-expanded={languageOpen} disabled={languageSaving}>
            {languageSaving ? <LoaderCircle className="language-spinner" size={17} /> : <Globe2 size={17} />}
            <span><small>{t('language_label')}</small><strong>{languageOptions.find((option) => option.code === locale)?.label}</strong></span>
            <ChevronDown className="language-chevron" size={15} />
          </button>
          {languageOpen ? <div className="language-menu" role="menu">{languageOptions.map((option) => (
            <button type="button" role="menuitemradio" aria-checked={locale === option.code} className={locale === option.code ? 'active' : ''} key={option.code} onClick={() => changeLanguage(option.code)}>
              <span className="language-code">{option.code.toUpperCase()}</span><span><strong>{option.label}</strong><small>{languageNativeHint(option.code)}</small></span>{locale === option.code ? <Check size={16} /> : null}
            </button>
          ))}</div> : null}
        </div>
        {user ? <div className="top-actions">
          {admin ? <AdminNavLink t={t} /> : null}
          <Link className={`subscription-nav ${user.subscription?.hasFullAccess ? 'premium' : ''}`} href={withLocale(locale, '/subscription')}><Crown size={16} /> {user.subscription?.hasFullAccess ? 'Premium' : 'Free'}</Link>
          <span className="username-pill"><span className="user-avatar">{(user?.username || user?.email || 'U').charAt(0).toUpperCase()}</span><span className="user-name">{user?.username || user?.email}</span></span>
          <button className="logout-button" onClick={() => setConfirmLogout(true)} aria-label={t('logout_title')}>
            <LogOut size={18} />
          </button>
        </div> : <div className="guest-actions">
          {admin ? <AdminNavLink t={t} /> : null}
          <Link className="guest-login" href={withLocale(locale, '/login')}>{t('login')}</Link>
          <Link className="guest-signup" href={withLocale(locale, '/signup')}>{t('signup')}</Link>
        </div>}
      </header>

      <main>{children}</main>

      {confirmLogout ? (
        <div className="modal-backdrop" onClick={() => setConfirmLogout(false)}>
          <div className="confirm-panel" onClick={(event) => event.stopPropagation()}>
            <h2>{t('logout_confirm_title')}</h2>
            <p>{t('logout_confirm_body')}</p>
            <div>
              <button onClick={() => setConfirmLogout(false)}>{t('cancel')}</button>
              <button className="danger" onClick={logout}>
                {t('logout_title')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NavMenu({ activeCategory, locale, user, t, isFavorites, isVocabulary }) {
  const icons = { Movie: <Film size={16} />, Series: <Tv size={16} />, Cartoon: <Clapperboard size={16} /> };
  return (
    <nav className="nav-tabs">
      {categoryKeys.map((key) => (
        <Link key={key} className={activeCategory === key && !isVocabulary && !isFavorites ? 'selected' : ''} href={catalogUrl(locale, { category: key })}>
          {icons[key]}
          <span>{t(categoryLabelKey(key))}</span>
        </Link>
      ))}
      {user ? <Link className={isFavorites ? 'selected' : ''} href={withLocale(locale, '/favorites')}><Heart size={16} /><span>{t('nav_favorites')}</span></Link> : null}
      {user ? <Link className={isVocabulary ? 'selected' : ''} href={withLocale(locale, '/vocabulary')}><BookOpen size={16} /><span>{t('nav_vocabulary')}</span></Link> : null}
    </nav>
  );
}

function languageNativeHint(code) {
  if (code === 'tm') return 'Türkmen dili';
  if (code === 'ru') return 'Русский язык';
  return 'English language';
}

/**
 * The admin panel is a separate SPA. /admin is served by nginx in production;
 * during development point NEXT_PUBLIC_ADMIN_URL at the admin dev server
 * (e.g. http://localhost:5174/admin). A plain anchor forces the full page load
 * into the other app, so Next's client router never fetches a route that no
 * longer exists here.
 */
function AdminNavLink({ t }) {
  const href = process.env.NEXT_PUBLIC_ADMIN_URL || '/admin';
  return (
    <a className="admin-route-link" href={href}>
      <LayoutDashboard size={17} /> {t('nav_admin')}
    </a>
  );
}
