'use client';

import { Eye, EyeOff, Lock, Mail, User } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import {
  forgotPassword,
  login,
  resendVerification,
  resetPassword,
  signup,
  verifyEmail,
  verifyPasswordReset
} from '../api/endpoints';
import { moviesQuery } from '../api/queries';
import { useSession } from '../ui/session.jsx';

const initialForm = {
  username: '',
  email: '',
  password: '',
  confirmPassword: '',
  newPassword: '',
  confirmNewPassword: ''
};

const verificationStorageKey = 'kinochy:pending-verification';

function cloneAuthForm() {
  return { ...initialForm };
}

// Cover wall layout (Steam splash style): a dense, always-full grid of real
// film art. The product's own catalog covers lead the wall; openly-licensed
// cinema photographs (projector, clapperboard, auditorium, film strip) keep it
// rich even when the catalog is thin. Each column is duplicated so the CSS
// drift loop scrolls exactly one period before snapping back, and columns run
// at different speeds for a layered, living-wall effect.
const wallArt = [
  '/wall-projector.jpg',
  '/wall-clapperboard.jpg',
  '/wall-cinema-hall.jpg',
  '/film-strip.jpg'
];

function buildPosterColumns(movies) {
  const covers = (movies || []).map((movie) => movie.coverUrl).filter(Boolean);
  const pool = [...covers, ...wallArt];
  if (!pool.length) return [];
  const columnCount = 8;
  const rows = 4;
  return Array.from({ length: columnCount }, (_, columnIndex) => {
    const column = Array.from({ length: rows }, (_, row) => ({
      src: pool[(columnIndex * rows + row) % pool.length],
      seed: columnIndex * rows + row
    }));
    return [...column, ...column];
  });
}

function readPendingVerification() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(verificationStorageKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function savePendingVerification(value) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(verificationStorageKey, JSON.stringify(value));
  } catch {}
}

function clearPendingVerification() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(verificationStorageKey);
  } catch {}
}

export default function AuthView({ mode = 'login', embedded = false }) {
  const [panel, setPanel] = useState(mode === 'signup' ? 'signup' : 'login');
  const [form, setForm] = useState(() => cloneAuthForm());
  const [verification, setVerification] = useState({
    flow: 'signup',
    email: '',
    username: '',
    code: '',
    expiresAt: '',
    canResendAt: 0
  });
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState({});
  const router = useRouter();
  const { setUser, setAdmin } = useSession();
  const t = useTranslations();

  // Real catalog covers drive the cinematic poster wall behind the stage.
  // The catalog endpoint is public, so this works for signed-out visitors
  // and silently degrades to the gradient backdrop if the API is unreachable.
  const catalogQuery = useQuery({ ...moviesQuery(), enabled: !embedded });
  const posterColumns = useMemo(() => buildPosterColumns(catalogQuery.data), [catalogQuery.data]);

  useEffect(() => {
    if (panel !== 'verify') return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    const sync = () => setNow(Date.now());
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [panel]);

  useEffect(() => {
    const saved = readPendingVerification();
    if (!saved || mode !== 'signup') return;
    if (Date.parse(saved.expiresAt || 0) <= Date.now()) {
      clearPendingVerification();
      return;
    }
    setVerification(saved);
    setPanel('verify');
  }, [mode]);

  function update(event) {
    setForm((value) => ({ ...value, [event.target.name]: event.target.value }));
  }

  function updateVerificationCode(event) {
    setVerification((value) => ({
      ...value,
      code: String(event.target.value || '')
        .replace(/\D/g, '')
        .slice(0, 6)
    }));
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');

    try {
      if (panel === 'signup') {
        validateSignup(form, t);
        const data = await signup({
          username: form.username,
          email: form.email,
          password: form.password
        });
        openVerificationPanel('signup', data.pending);
        return;
      }

      if (panel === 'forgot') {
        if (!isValidEmail(form.email)) throw new Error(t('auth_invalid_email'));
        const data = await forgotPassword(form.email);
        openVerificationPanel('forgot', data.pending);
        return;
      }

      if (panel === 'verify') {
        if (verification.flow === 'forgot') {
          await verifyPasswordReset({ email: verification.email, code: verification.code });
          clearPendingVerification();
          setPanel('reset');
          return;
        }

        const data = await verifyEmail({ email: verification.email, code: verification.code });
        clearPendingVerification();
        setUser(data.user);
        if (!embedded) router.push('/');
        return;
      }

      if (panel === 'reset') {
        if (!isStrongPassword(form.newPassword)) throw new Error(t('auth_strong_password'));
        if (form.newPassword !== form.confirmNewPassword)
          throw new Error(t('auth_password_mismatch'));
        await resetPassword({
          email: verification.email,
          code: verification.code,
          password: form.newPassword
        });
        clearPendingVerification();
        setForm(cloneAuthForm());
        setPanel('login');
        return;
      }

      const data = await login({ email: form.email, password: form.password });
      setUser(data.user);
      setAdmin(data.user.role === 'admin' ? { id: data.user.id, email: data.user.email } : null);
      if (!embedded) router.push(data.user.role === 'admin' ? '/admin' : '/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    setBusy(true);
    setError('');
    try {
      const data =
        verification.flow === 'forgot'
          ? await forgotPassword(verification.email)
          : await resendVerification(verification.email);
      const nextVerification = {
        ...verification,
        expiresAt: data.pending.verificationExpiresAt,
        canResendAt: Date.now() + 30 * 1000
      };
      setVerification((value) => ({
        ...value,
        expiresAt: nextVerification.expiresAt,
        canResendAt: nextVerification.canResendAt
      }));
      savePendingVerification(nextVerification);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function openVerificationPanel(flow, pending) {
    const nextVerification = {
      flow,
      email: pending.email,
      username: pending.username || form.username,
      code: '',
      expiresAt: pending.verificationExpiresAt,
      canResendAt: Date.now() + 30 * 1000
    };
    setVerification(nextVerification);
    savePendingVerification(nextVerification);
    setPanel('verify');
  }

  function switchPanel(nextPanel) {
    setPanel(nextPanel);
    setForm(cloneAuthForm());
    setVisiblePasswords({});
    if (nextPanel !== 'verify') clearPendingVerification();
    setError('');
  }

  function togglePassword(name) {
    setVisiblePasswords((value) => ({ ...value, [name]: !value[name] }));
  }

  const verifyExpiresAt = Date.parse(verification.expiresAt || 0);
  const verifySeconds = Number.isFinite(verifyExpiresAt)
    ? Math.max(0, Math.ceil((verifyExpiresAt - now) / 1000))
    : 0;
  const resendSeconds = Math.max(0, Math.ceil((verification.canResendAt - now) / 1000));

  const stage = !embedded;

  return (
    <section className={stage ? 'auth-stage' : 'auth-page'}>
      {stage ? (
        <>
          <div className="auth-coverwall" aria-hidden="true">
            {posterColumns.map((tiles, columnIndex) => (
              <div className="auth-covercol" key={columnIndex}>
                {tiles.map((tile, index) => (
                  <img
                    className="auth-cover"
                    src={tile.src}
                    alt=""
                    loading={columnIndex < 4 && index < 3 ? 'eager' : 'lazy'}
                    decoding="async"
                    sizes="240px"
                    key={`${tile.seed}-${index}`}
                  />
                ))}
              </div>
            ))}
          </div>
          <div className="auth-scrim" aria-hidden="true" />

          <div className="auth-layout">
            <div className="auth-playbill">
              <h2 className="auth-claim">
                {mode === 'signup' ? t('auth_hero_signup_title') : t('auth_hero_title')}
              </h2>
              <p className="auth-lead">
                {mode === 'signup' ? t('auth_hero_signup_copy') : t('auth_hero_copy')}
              </p>
              <ol className="auth-steps">
                <li>
                  <span className="auth-step-term">{t('auth_feature_watch')}</span>
                  <span className="auth-step-desc">{t('auth_feature_watch_copy')}</span>
                </li>
                <li>
                  <span className="auth-step-term">{t('auth_feature_subtitles')}</span>
                  <span className="auth-step-desc">{t('auth_feature_subtitles_copy')}</span>
                </li>
                <li>
                  <span className="auth-step-term">{t('auth_feature_languages')}</span>
                  <span className="auth-step-desc">{t('auth_feature_languages_copy')}</span>
                </li>
              </ol>
            </div>

            <div className="auth-ticket">
              <div className="auth-ticket-head">
                <span className="auth-stripe" aria-hidden="true">
                  {Array.from({ length: 16 }, (_, i) => (
                    <i key={i} />
                  ))}
                </span>
                <span className="auth-wordmark">Kinochy</span>
                <span className="auth-admit">
                  {mode === 'signup' ? t('auth_admit_signup') : t('auth_admit_login')}
                </span>
              </div>
              <span className="auth-perf" aria-hidden="true" />

              <form className="auth-panel" onSubmit={submit}>
                <h1>{getPanelTitle(panel, verification.flow, t)}</h1>

                {panel === 'verify' ? (
                  <>
                    <p className="verify-copy">
                      {verification.flow === 'forgot'
                        ? t('auth_reset_verify_copy')
                        : t('auth_verify_copy')}{' '}
                      <strong>{verification.email}</strong>
                    </p>
                    <label>
                      {t('auth_verification_code')}
                      <input
                        name="verificationCode"
                        value={verification.code}
                        onChange={updateVerificationCode}
                        inputMode="numeric"
                        pattern="\d{6}"
                        minLength="6"
                        maxLength="6"
                        placeholder={t('auth_verification_hint')}
                        autoComplete="one-time-code"
                        required
                      />
                    </label>
                    <p className="verify-copy">
                      {t('auth_code_expires_in')} {formatCountdown(verifySeconds)}
                    </p>
                  </>
                ) : null}

                {panel === 'signup' ? (
                  <label>
                    {t('auth_username')}
                    <span className="field-icon">
                      <User className="field-leading" size={16} aria-hidden="true" />
                      <input
                        name="username"
                        value={form.username}
                        onChange={update}
                        minLength="2"
                        placeholder={t('auth_username_hint')}
                        autoComplete="username"
                        required
                      />
                    </span>
                  </label>
                ) : null}

                {['login', 'signup', 'forgot'].includes(panel) ? (
                  <label>
                    {t('auth_email')}
                    <span className="field-icon">
                      <Mail className="field-leading" size={16} aria-hidden="true" />
                      <input
                        name="email"
                        value={form.email}
                        onChange={update}
                        type="email"
                        placeholder={t('auth_email_hint')}
                        autoComplete="email"
                        required
                      />
                    </span>
                  </label>
                ) : null}

                {['login', 'signup'].includes(panel) ? (
                  <PasswordField
                    label={t('auth_password')}
                    name="password"
                    value={form.password}
                    onChange={update}
                    visible={Boolean(visiblePasswords.password)}
                    onToggle={() => togglePassword('password')}
                    minLength="8"
                    placeholder={t('auth_password_hint')}
                    autoComplete={panel === 'signup' ? 'new-password' : 'current-password'}
                    required
                  />
                ) : null}

                {panel === 'login' ? (
                  <button type="button" className="text-link" onClick={() => switchPanel('forgot')}>
                    {t('auth_forgot_password')}
                  </button>
                ) : null}

                {panel === 'signup' ? (
                  <PasswordField
                    label={t('auth_confirm_password')}
                    name="confirmPassword"
                    value={form.confirmPassword}
                    onChange={update}
                    visible={Boolean(visiblePasswords.confirmPassword)}
                    onToggle={() => togglePassword('confirmPassword')}
                    minLength="8"
                    placeholder={t('auth_confirm_hint')}
                    autoComplete="new-password"
                    required
                  />
                ) : null}

                {panel === 'reset' ? (
                  <>
                    <PasswordField
                      label={t('auth_new_password')}
                      name="newPassword"
                      value={form.newPassword}
                      onChange={update}
                      visible={Boolean(visiblePasswords.newPassword)}
                      onToggle={() => togglePassword('newPassword')}
                      minLength="8"
                      placeholder={t('auth_password_label')}
                      autoComplete="new-password"
                      required
                    />
                    <PasswordField
                      label={t('auth_confirm_password')}
                      name="confirmNewPassword"
                      value={form.confirmNewPassword}
                      onChange={update}
                      visible={Boolean(visiblePasswords.confirmNewPassword)}
                      onToggle={() => togglePassword('confirmNewPassword')}
                      minLength="8"
                      placeholder={t('auth_confirm_hint')}
                      autoComplete="new-password"
                      required
                    />
                  </>
                ) : null}

                {error ? <p className="form-error">{error}</p> : null}

                <button className="primary" disabled={busy}>
                  {busy ? t('auth_wait') : getPanelAction(panel, verification.flow, t)}
                </button>

                {panel === 'verify' ? (
                  <div className="auth-verify-actions">
                    <button
                      type="button"
                      className="text-link"
                      onClick={resendCode}
                      disabled={busy || resendSeconds > 0}
                    >
                      {resendSeconds > 0
                        ? `${t('auth_resend_code')} (${resendSeconds}s)`
                        : t('auth_resend_code')}
                    </button>
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => switchPanel('login')}
                    >
                      {t('auth_back_to_login')}
                    </button>
                  </div>
                ) : panel === 'signup' ? (
                  <p className="auth-switch">
                    {t('auth_have_account')}{' '}
                    <button type="button" onClick={() => switchPanel('login')}>
                      {t('login')}
                    </button>
                  </p>
                ) : panel === 'login' ? (
                  <p className="auth-switch">
                    {t('auth_need_account')}{' '}
                    <button type="button" onClick={() => switchPanel('signup')}>
                      {t('signup')}
                    </button>
                  </p>
                ) : (
                  <button type="button" className="text-link" onClick={() => switchPanel('login')}>
                    {t('auth_back_to_login')}
                  </button>
                )}

                {!embedded ? (
                  <Link className="auth-home-link" href="/">
                    {t('auth_back_home')}
                  </Link>
                ) : null}
              </form>

              <div className="auth-ticket-stub">
                <Image
                  className="auth-filmstrip"
                  src="/film-strip.jpg"
                  alt="A strip of 35mm motion-picture film"
                  width={1024}
                  height={265}
                />
                <p className="auth-fineprint">{t('auth_fineprint')}</p>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

function PasswordField({ label, name, value, onChange, visible, onToggle, ...inputProps }) {
  return (
    <label>
      {label}
      <span className="field-icon password-field">
        <Lock className="field-leading" size={16} aria-hidden="true" />
        <input
          name={name}
          value={value}
          onChange={onChange}
          type={visible ? 'text' : 'password'}
          {...inputProps}
        />
        <button
          type="button"
          className="password-toggle"
          onClick={onToggle}
          aria-label={visible ? 'Hide password' : 'Show password'}
          title={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </span>
    </label>
  );
}

function validateSignup(form, t) {
  if (!isValidEmail(form.email)) throw new Error(t('auth_invalid_email'));
  if (!isStrongPassword(form.password)) throw new Error(t('auth_strong_password'));
  if (form.password !== form.confirmPassword) throw new Error(t('auth_password_mismatch'));
}

function getPanelTitle(panel, flow, t) {
  if (panel === 'signup') return t('signup');
  if (panel === 'verify')
    return flow === 'forgot' ? t('auth_reset_verify_title') : t('auth_verify_title');
  if (panel === 'forgot') return t('auth_forgot_title');
  if (panel === 'reset') return t('auth_reset_title');
  return t('login');
}

function getPanelAction(panel, flow, t) {
  if (panel === 'signup') return t('auth_create_account');
  if (panel === 'verify')
    return flow === 'forgot' ? t('auth_verify_action') : t('auth_verify_action');
  if (panel === 'forgot') return t('auth_send_code');
  if (panel === 'reset') return t('auth_update_password');
  return t('login');
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function isStrongPassword(password) {
  const value = String(password || '');
  return (
    value.length >= 8 &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /\d/.test(value) &&
    /[^A-Za-z0-9]/.test(value)
  );
}

function formatCountdown(totalSeconds) {
  const seconds = Math.max(0, Number(totalSeconds) || 0);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}
