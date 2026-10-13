import { Check, ChevronDown, Crown, Globe2, LayoutDashboard, LoaderCircle, LogOut, Search } from 'lucide-react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { withBasePath } from '../paths';
import { getLanguageOptions, LocaleProvider, t } from './locale.jsx';
import AuthPage from '../views/AuthPage.jsx';

export default function AppShell() {
  const [search, setSearch] = useState('');
  const [user, setUser] = useState(null);
  const [admin, setAdmin] = useState(null);
  const [checking, setChecking] = useState(true);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [languageSaving, setLanguageSaving] = useState(false);
  const languageRef = useRef(null);
  const [locale, setLocale] = useState(() => window.localStorage.getItem('kinochy_locale') || 'tm');
  const navigate = useNavigate();
  const location = useLocation();
  const isVocabulary = location.pathname === '/vocabulary';
  const isFavorites = location.pathname === '/favorites';
  const category = new URLSearchParams(location.search).get('category') || 'Movie';
  const loggedOut = !checking && !user;
  const publicHeader = checking || !user;
  const languageOptions = getLanguageOptions();

  useEffect(() => {
    window.localStorage.setItem('kinochy_locale', locale);
  }, [locale]);

  useEffect(() => {
    setChecking(true);
    Promise.all([
      api('/api/users/me').then((data) => data.user).catch(() => null),
      api('/api/auth/me').then((data) => data.admin).catch(() => null)
    ])
      .then(([currentUser, currentAdmin]) => {
        setUser(currentUser);
        setAdmin(currentAdmin);
      })
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    if (user?.language) setLocale(user.language);
  }, [user?.language]);

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
    navigate(`/?search=${encodeURIComponent(search)}`);
  }

  async function changeLanguage(nextLocale) {
    if (nextLocale === locale) { setLanguageOpen(false); return; }
    const previousLocale = locale;
    setLocale(nextLocale);
    setLanguageOpen(false);
    if (!user) return;
    setLanguageSaving(true);
    try {
      const data = await api('/api/users/language', {
        method: 'PATCH',
        body: JSON.stringify({ language: nextLocale })
      });
      setUser(data.user);
    } catch {
      setLocale(previousLocale);
    } finally {
      setLanguageSaving(false);
    }
  }

  async function logout() {
    await api('/api/users/logout', { method: 'POST', body: JSON.stringify({}) });
    setUser(null);
    setConfirmLogout(false);
    navigate('/');
  }

  const tr = (key) => t(locale, key);

  return (
    <LocaleProvider value={{ locale, setLocale: changeLanguage, t: tr, languageOptions }}>
      <div className="app">
        <header className={`topbar ${publicHeader ? 'public-topbar' : ''}`}>
          <Link to="/" className="brand" aria-label="Kinochy home">
            <span className="brand-mark">
              <img src={withBasePath('/kinochy_favicon.png')} alt="" width="32" height="32" />
            </span>
            <span>Kinochy</span>
          </Link>

          {user ? (
            <>
              <nav className="nav-tabs">
                <Link className={category === 'Movie' && !isVocabulary && !isFavorites ? 'selected' : ''} to="/?category=Movie">{tr('nav_movies')}</Link>
                <Link className={category === 'Series' ? 'selected' : ''} to="/?category=Series">{tr('nav_series')}</Link>
                <Link className={category === 'Cartoon' ? 'selected' : ''} to="/?category=Cartoon">{tr('nav_cartoons')}</Link>
                <Link className={isFavorites ? 'selected' : ''} to="/favorites">{tr('nav_favorites')}</Link>
                <Link className={isVocabulary ? 'selected' : ''} to="/vocabulary">{tr('nav_vocabulary')}</Link>
              </nav>
              <form className="search" onSubmit={submitSearch}>
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tr('search_placeholder')} />
                <button aria-label={tr('search_label')}>
                  <Search size={21} />
                </button>
              </form>
              <div ref={languageRef} className={`language-picker language-switch ${languageOpen ? 'open' : ''}`}>
                <button type="button" className="language-switch-trigger" onClick={() => setLanguageOpen((value) => !value)} aria-label={tr('language_label')} aria-haspopup="menu" aria-expanded={languageOpen} disabled={languageSaving}>
                  {languageSaving ? <LoaderCircle className="language-spinner" size={17} /> : <Globe2 size={17} />}
                  <span><small>{tr('language_label')}</small><strong>{languageOptions.find((option) => option.code === locale)?.label}</strong></span>
                  <ChevronDown className="language-chevron" size={15} />
                </button>
                {languageOpen ? <div className="language-menu" role="menu">{languageOptions.map((option) => (
                  <button type="button" role="menuitemradio" aria-checked={locale === option.code} className={locale === option.code ? 'active' : ''} key={option.code} onClick={() => changeLanguage(option.code)}>
                    <span className="language-code">{option.code.toUpperCase()}</span><span><strong>{option.label}</strong><small>{languageNativeHint(option.code)}</small></span>{locale === option.code ? <Check size={16} /> : null}
                  </button>
                ))}</div> : null}
              </div>
              <div className="top-actions">
                {admin ? (
                  <Link className="admin-route-link" to="/admin">
                    <LayoutDashboard size={17} /> {tr('nav_admin')}
                  </Link>
                ) : null}
                <Link className={`subscription-nav ${user.subscription?.hasFullAccess ? 'premium' : ''}`} to="/subscription"><Crown size={16} /> {user.subscription?.hasFullAccess ? 'Premium' : 'Free'}</Link>
                <span className="username-pill">{user?.username || user?.email}</span>
                <button className="logout-button" onClick={() => setConfirmLogout(true)} aria-label={tr('logout_title')}>
                  <LogOut size={18} />
                </button>
              </div>
            </>
          ) : null}
          {admin && !user ? (
            <Link className="admin-route-link" to="/admin">
              <LayoutDashboard size={17} /> {tr('nav_admin')}
            </Link>
          ) : null}
        </header>

        <main>{checking ? <div className="status" /> : loggedOut ? <AuthPage embedded onAuth={setUser} /> : <Outlet />}</main>

        {confirmLogout ? (
          <div className="modal-backdrop" onClick={() => setConfirmLogout(false)}>
            <div className="confirm-panel" onClick={(event) => event.stopPropagation()}>
              <h2>{tr('logout_confirm_title')}</h2>
              <p>{tr('logout_confirm_body')}</p>
              <div>
                <button onClick={() => setConfirmLogout(false)}>{tr('cancel')}</button>
                <button className="danger" onClick={logout}>
                  {tr('logout_title')}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </LocaleProvider>
  );
}

function languageNativeHint(code) {
  if (code === 'tm') return 'Türkmen dili';
  if (code === 'ru') return 'Русский язык';
  return 'English language';
}
