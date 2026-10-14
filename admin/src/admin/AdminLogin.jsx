import { ArrowLeft, Lock } from 'lucide-react';
import { useTranslations } from 'use-intl';
import { useState } from 'react';
import { adminLogin } from '../api/endpoints';

export default function AdminLogin({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const t = useTranslations();

  async function submit(event) {
    event.preventDefault();
    setError('');
    try {
      const data = await adminLogin({ email, password });
      onLogin(data.admin);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="admin-page">
      <form className="login-panel" onSubmit={submit}>
        <Lock size={30} />
        <h1>{t('admin_title')}</h1>
        <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder={t('admin_email_hint')} autoComplete="username" />
        <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t('admin_password_hint')} type="password" autoComplete="current-password" />
        {error ? <p className="form-error">{error}</p> : null}
        <button className="primary">{t('login')}</button>
        <a className="admin-back-link" href={import.meta.env.VITE_SITE_URL || '/'}><ArrowLeft size={16} /> {t('nav_back_to_site')}</a>
      </form>
    </section>
  );
}
