import { ArrowLeft, CheckCircle2, Eye, EyeOff, Film, LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react';
import { useTranslations } from 'use-intl';
import { useState } from 'react';
import { adminLogin } from '../api/endpoints';
import logo from '../assets/kinochy_favicon.png';

export default function AdminLogin({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const t = useTranslations();

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const data = await adminLogin({ email, password });
      onLogin(data.admin);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="admin-login-page">
      <div className="admin-login-shell">
        <aside className="admin-login-story">
          <div className="admin-login-brand"><span><img src={logo} alt="" /></span><div><strong>Dilewar</strong><small>Content operations</small></div></div>
          <div className="admin-login-copy">
            <span className="admin-login-kicker"><Sparkles size={14} /> Studio workspace</span>
            <h1>Shape every story from one place.</h1>
            <p>Manage the catalog, publish new releases, and keep your community healthy in a focused workspace built for content teams.</p>
          </div>
          <div className="admin-login-features">
            <span><Film size={17} /><span><strong>Catalog control</strong><small>Movies, series and cartoons</small></span></span>
            <span><ShieldCheck size={17} /><span><strong>Protected access</strong><small>Administrator-only workspace</small></span></span>
          </div>
          <span className="admin-login-status"><CheckCircle2 size={14} /> All systems operational</span>
        </aside>

        <div className="admin-login-form-wrap">
          <form className="login-panel" onSubmit={submit}>
            <div className="admin-login-icon"><LockKeyhole size={22} /></div>
            <div className="admin-login-heading"><span>Welcome back</span><h2>{t('admin_title')}</h2><p>Enter your administrator credentials to continue.</p></div>
            <label><span>Email address</span><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder={t('admin_email_hint')} autoComplete="username" required autoFocus /></label>
            <label><span>Password</span><span className="admin-password-field"><input value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t('admin_password_hint')} type={showPassword ? 'text' : 'password'} autoComplete="current-password" required /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <button className="primary admin-login-submit" disabled={submitting}>{submitting ? 'Signing in…' : t('login')}</button>
            <a className="admin-back-link" href={import.meta.env.VITE_SITE_URL || '/'}><ArrowLeft size={16} /> {t('nav_back_to_site')}</a>
          </form>
        </div>
      </div>
    </section>
  );
}
