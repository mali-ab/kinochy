import { Save } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createUser, updateUser } from '../api/endpoints';
import { adminUserQuery } from '../api/queries';
import { cloneUserForm } from './helpers.js';

/**
 * @param {{ mode: 'add' | 'edit', id?: string | null }} props
 */
export default function AdminUserDetail({ mode, id = null }) {
  const navigate = useNavigate();
  const [form, setForm] = useState(() => cloneUserForm());
  const [error, setError] = useState('');
  const userResult = useQuery({ ...adminUserQuery(id ?? ''), enabled: mode === 'edit' && Boolean(id), retry: false });
  const loading = mode === 'edit' && userResult.isPending;

  useEffect(() => {
    const user = userResult.data;
    if (!user) return;
    setForm({ username: user.username, email: user.email, password: '', role: user.role || 'user', subscriptionPlan: user.subscriptionPlan || 'free', subscriptionExpiresAt: user.subscriptionExpiresAt?.slice(0, 10) || '' });
  }, [userResult.data]);

  async function submit(event) {
    event.preventDefault();
    setError('');
    try {
      const payload = { ...form, subscriptionExpiresAt: form.subscriptionExpiresAt || null };
      if (mode === 'edit') {
        await updateUser(id, payload);
      } else {
        await createUser(payload);
      }
      navigate('/users');
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) return <div className="status">Loading user...</div>;

  return (
    <form className="admin-form compact admin-user-panel" onSubmit={submit}>
      <div className="admin-list-head">
        <h2>{mode === 'edit' ? 'Edit user' : 'Add user'}</h2>
        <button type="button" onClick={() => navigate('/users')}>Cancel</button>
      </div>
      <div className="form-grid">
        <label>Username<input value={form.username} onChange={(event) => setForm((value) => ({ ...value, username: event.target.value }))} required /></label>
        <label>Email<input type="email" value={form.email} onChange={(event) => setForm((value) => ({ ...value, email: event.target.value }))} required /></label>
        <label>Password<input type="password" value={form.password} onChange={(event) => setForm((value) => ({ ...value, password: event.target.value }))} placeholder={mode === 'edit' ? 'Leave empty to keep current' : 'Strong password'} required={mode !== 'edit'} /></label>
        <label>Role<select value={form.role} onChange={(event) => setForm((value) => ({ ...value, role: event.target.value }))}><option value="user">User</option><option value="admin">Admin</option></select></label>
        <label>Subscription<select value={form.subscriptionPlan} onChange={(event) => setForm((value) => ({ ...value, subscriptionPlan: event.target.value }))}><option value="free">Free · 10-minute preview</option><option value="premium">Premium · Full movies</option></select></label>
        <label>Premium expires<input type="date" value={form.subscriptionExpiresAt} disabled={form.subscriptionPlan !== 'premium'} onChange={(event) => setForm((value) => ({ ...value, subscriptionExpiresAt: event.target.value }))} /><small>Leave empty for no expiry.</small></label>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      <button className="primary"><Save size={18} /> {mode === 'edit' ? 'Save user' : 'Add user'}</button>
    </form>
  );
}
