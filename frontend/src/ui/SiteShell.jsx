'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { BookOpen, Check, ChevronDown, Clapperboard, Crown, Film, Globe2, Heart, LayoutDashboard, LoaderCircle, LogOut, Search, Tv } from 'lucide-react';
import { logout as logoutUser } from '../api/endpoints';
import logo from '../../public/kinochy_favicon.png';
import { LocaleProvider, useLocale } from './locale.jsx';
import { SessionProvider, useSession } from './session.jsx';

export default function SiteShell({ children }) {
  return (
    <SessionProvider>
      <LocaleProvider>
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
  const { user, admin, checking, setUser } = useSession();
  const { locale, setLocale, t, languageOptions, saving: languageSaving } = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const isVocabulary = pathname === '/vocabulary';
  const isFavorites = pathname === '/favorites';
  const publicHeader = checking;

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
    router.push(`/?search=${encodeURIComponent(search)}`);
  }

  function changeLanguage(nextLocale) {
    setLanguageOpen(false);
    setLocale(nextLocale);
  }

  async function logout() {
    await logoutUser();
    setUser(null);
    queryClient.invalidateQueries({ queryKey: ['users'] });
    setConfirmLogout(false);
    router.push('/');
  }

  return (
    <div className="app">
      <header className={`topbar ${publicHeader ? 'public-topbar' : ''}`}>
        <Link href="/" className="brand" aria-label="Kinochy home">
          <span className="brand-mark">
            <Image src={logo} alt="" width={32} height={32} priority />
          </span>
          <span>Kinochy</span>
        </Link>

        {!checking ? (
          <>
            <NavTabs user={user} t={t} isFavorites={isFavorites} isVocabulary={isVocabulary} />
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
              {admin ? (
                <Link className="admin-route-link" href="/admin">
                  <LayoutDashboard size={17} /> {t('nav_admin')}
                </Link>
              ) : null}
              <Link className={`subscription-nav ${user.subscription?.hasFullAccess ? 'premium' : ''}`} href="/subscription"><Crown size={16} /> {user.subscription?.hasFullAccess ? 'Premium' : 'Free'}</Link>
              <span className="username-pill"><span className="user-avatar">{(user?.username || user?.email || 'U').charAt(0).toUpperCase()}</span><span className="user-name">{user?.username || user?.email}</span></span>
              <button className="logout-button" onClick={() => setConfirmLogout(true)} aria-label={t('logout_title')}>
                <LogOut size={18} />
              </button>
            </div> : <div className="guest-actions">
              {admin ? <Link className="admin-route-link" href="/admin"><LayoutDashboard size={17} /> {t('nav_admin')}</Link> : null}
              <Link className="guest-login" href="/login">{t('login')}</Link>
              <Link className="guest-signup" href="/signup">{t('signup')}</Link>
            </div>}
          </>
        ) : null}
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

function NavTabs(props) {
  return (
    <Suspense fallback={<NavMenu {...props} category="Movie" />}>
      <NavTabsWithParams {...props} />
    </Suspense>
  );
}

function NavTabsWithParams(props) {
  const searchParams = useSearchParams();
  return <NavMenu {...props} category={searchParams.get('category') || 'Movie'} />;
}

function NavMenu({ category, user, t, isFavorites, isVocabulary }) {
  return (
    <nav className="nav-tabs">
      <Link className={category === 'Movie' && !isVocabulary && !isFavorites ? 'selected' : ''} href="/?category=Movie"><Film size={16} /><span>{t('nav_movies')}</span></Link>
      <Link className={category === 'Series' ? 'selected' : ''} href="/?category=Series"><Tv size={16} /><span>{t('nav_series')}</span></Link>
      <Link className={category === 'Cartoon' ? 'selected' : ''} href="/?category=Cartoon"><Clapperboard size={16} /><span>{t('nav_cartoons')}</span></Link>
      {user ? <Link className={isFavorites ? 'selected' : ''} href="/favorites"><Heart size={16} /><span>{t('nav_favorites')}</span></Link> : null}
      {user ? <Link className={isVocabulary ? 'selected' : ''} href="/vocabulary"><BookOpen size={16} /><span>{t('nav_vocabulary')}</span></Link> : null}
    </nav>
  );
}

function languageNativeHint(code) {
  if (code === 'tm') return 'Türkmen dili';
  if (code === 'ru') return 'Русский язык';
  return 'English language';
}
