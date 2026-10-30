import { ChevronRight, CircleCheck, Clapperboard, Database, Film, LayoutDashboard, LogOut, MessageSquareText, MonitorPlay, ShieldCheck, Users } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslations } from 'use-intl';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import logo from '../assets/kinochy_favicon.png';
import { adminLogout } from '../api/endpoints';
import { adminSessionQuery, queryKeys } from '../api/queries';
import { LocaleProvider } from '../ui/locale.jsx';
import AdminLogin from './AdminLogin.jsx';
import { ConfirmProvider, useConfirm } from './confirm.jsx';

export default function AdminShell({ children }) {
  return (
    <LocaleProvider>
      <div className="app admin-app">
        <AdminGate>{children}</AdminGate>
      </div>
    </LocaleProvider>
  );
}

function AdminGate({ children }) {
  const queryClient = useQueryClient();
  const { data: admin = null, isPending: checking } = useQuery({ ...adminSessionQuery(), retry: false });
  const t = useTranslations();

  function setAdmin(next) {
    queryClient.setQueryData(queryKeys.adminSession, next);
  }

  function clearSession() {
    setAdmin(null);
    queryClient.setQueryData(queryKeys.viewer, null);
  }

  if (checking) return <div className="status">{t('admin_checking')}</div>;
  if (!admin) return <AdminLogin onLogin={setAdmin} />;

  return (
    <ConfirmProvider>
      <AdminChrome admin={admin} onLogout={clearSession}>
        {children}
      </AdminChrome>
    </ConfirmProvider>
  );
}

function AdminChrome({ admin, onLogout, children }) {
  const t = useTranslations();
  const { requestConfirm } = useConfirm();
  const { pathname } = useLocation();
  const navigation = [
    { to: '/', label: 'Dashboard', detail: 'Platform overview', icon: LayoutDashboard, active: pathname === '/' },
    { to: '/films', label: 'Movies', detail: 'Standalone & series', icon: Film, active: pathname === '/films' || pathname.startsWith('/films/') },
    { to: '/cartoons', label: 'Cartoons', detail: 'Standalone & series', icon: Clapperboard, active: pathname === '/cartoons' || pathname.startsWith('/cartoons/') },
    { to: '/series', label: 'All series', detail: 'Movies & cartoons', icon: MonitorPlay, active: pathname === '/series' || pathname.startsWith('/series/') },
    { to: '/users', label: 'Users', detail: 'Accounts & access', icon: Users, active: pathname.startsWith('/users') },
    { to: '/comments', label: 'Comments', detail: 'Moderation queue', icon: MessageSquareText, active: pathname.startsWith('/comments') }
  ];
  const view = currentView(pathname);

  async function logout() {
    await adminLogout();
    onLogout();
  }

  return <div className="admin-shell-frame">
    <header className="admin-topbar">
      <div className="admin-topbar-inner">
        <Link to="/" className="admin-brand" aria-label="Dilewar administration home">
          <span className="brand-mark"><img src={logo} alt="" width={36} height={36} /></span>
          <span className="admin-brand-copy"><strong>Dilewar</strong><small>Content operations</small></span>
        </Link>
        <div className="admin-system-state"><span><CircleCheck size={14} /> System online</span><small>Production workspace</small></div>
        <div className="admin-head-actions">
          <div className="admin-identity"><span>{admin.username?.slice(0, 1).toUpperCase() || 'A'}</span><div><strong>{admin.username || 'Administrator'}</strong><small>{admin.email}</small></div><ShieldCheck size={17} /></div>
          <button className="admin-logout" aria-label={t('admin_logout')} onClick={() => requestConfirm({ title: 'Log out?', body: 'This will close your admin session.', actionLabel: t('admin_logout'), onConfirm: logout })}>
            <LogOut size={18} /><span>{t('admin_logout')}</span>
          </button>
        </div>
      </div>
      <nav className="admin-primary-nav" aria-label="Admin sections">
        <div className="admin-primary-nav-inner">
          {navigation.map((item) => { const Icon = item.icon; return <Link key={item.to} className={item.active ? 'active' : ''} to={item.to} aria-current={item.active ? 'page' : undefined}><Icon size={18} /><span><strong>{item.label}</strong><small>{item.detail}</small></span></Link>; })}
        </div>
      </nav>
    </header>

    <main className="admin-page">
      <div className="admin-view-context">
        <div><span className="admin-breadcrumb"><Link to="/">Admin</Link><ChevronRight size={13} />{view.label}</span><h1>{view.title}</h1><p>{view.description}</p></div>
        <div className="admin-context-badges"><span><Database size={15} /> Live catalog</span><span><ShieldCheck size={15} /> Admin access</span></div>
      </div>
      <div className="admin-view-content">{children}</div>
    </main>

    <footer className="admin-footer">
      <div className="admin-footer-inner">
        <div className="admin-footer-brand"><img src={logo} alt="" width={28} height={28} /><span><strong>Dilewar Admin</strong><small>Movies, learning and community in one workspace.</small></span></div>
        <nav aria-label="Footer navigation">{navigation.map((item) => <Link key={item.to} to={item.to}>{item.label}</Link>)}</nav>
        <span className="admin-footer-status"><CircleCheck size={14} /> Operational</span>
      </div>
    </footer>
  </div>;
}

function currentView(pathname) {
  if (pathname === '/') return { label: 'Dashboard', title: 'Operations dashboard', description: 'Monitor content, members and community activity across Dilewar.' };
  if (pathname.startsWith('/users')) return { label: 'Users', title: 'People & access', description: 'Manage member accounts, roles, subscriptions and account security.' };
  if (pathname.startsWith('/comments')) return { label: 'Comments', title: 'Community moderation', description: 'Review conversations and keep discussions useful and respectful.' };
  if (pathname === '/series' || pathname.startsWith('/series/')) return { label: 'All series', title: 'Series library', description: 'Movie and cartoon series, with seasons and playable episodes.' };
  if (pathname === '/cartoons' || pathname.startsWith('/cartoons/')) return { label: 'Cartoons', title: 'Cartoon library', description: 'Animated titles, from standalone videos to complete series.' };
  if (pathname === '/films' || pathname.startsWith('/films/')) return { label: 'Movies', title: 'Movie library', description: 'Standalone movies and movie series, with qualities, subtitles and episodes.' };
  if (pathname.startsWith('/movies/new')) return { label: 'New title', title: 'Publish new content', description: 'Add localized metadata, artwork and a playback source to the catalog.' };
  if (pathname.startsWith('/movies/')) return { label: 'Title workspace', title: 'Content details', description: 'Review playback, metadata, seasons and community activity.' };
  return { label: 'Films', title: 'Film library', description: 'Manage feature films, metadata, playback qualities and subtitles.' };
}
