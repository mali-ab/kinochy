import { Clapperboard, Film, LogOut, MessageSquareText, MonitorPlay, Users } from 'lucide-react';
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
  const usersActive = pathname.startsWith('/admin/users');
  const commentsActive = pathname.startsWith('/admin/comments');

  async function logout() {
    await adminLogout();
    onLogout();
  }

  return (
    <section className="admin-page">
      <div className="admin-head">
        <Link to="/admin" className="admin-brand">
          <span className="brand-mark">
            <img src={logo} alt="" width={32} height={32} />
          </span>
          <span>
            <small>{t('admin_signed_in_as')} {admin.email}</small>
            <strong>Kinochy Admin</strong>
          </span>
        </Link>
        <div className="admin-head-actions">
          <button
            onClick={() =>
              requestConfirm({
                title: 'Log out?',
                body: 'This will close your admin session.',
                actionLabel: t('admin_logout'),
                onConfirm: logout
              })
            }
          >
            <LogOut size={18} /> {t('admin_logout')}
          </button>
        </div>
      </div>

      <div className="admin-tabs">
        <Link className={pathname === '/admin/films' ? 'active' : ''} to="/admin/films">
          <Film size={18} /><span>Films<small>Feature movies</small></span>
        </Link>
        <Link className={pathname === '/admin/series' ? 'active' : ''} to="/admin/series">
          <MonitorPlay size={18} /><span>Serials<small>Seasons and episodes</small></span>
        </Link>
        <Link className={pathname === '/admin/cartoons' ? 'active' : ''} to="/admin/cartoons">
          <Clapperboard size={18} /><span>Cartoons<small>Animated titles</small></span>
        </Link>
        <Link className={usersActive ? 'active' : ''} to="/admin/users">
          <Users size={18} /><span>Users<small>Accounts and access</small></span>
        </Link>
        <Link className={commentsActive ? 'active' : ''} to="/admin/comments">
          <MessageSquareText size={18} /><span>Comments<small>Review discussions</small></span>
        </Link>
      </div>

      {children}
    </section>
  );
}
