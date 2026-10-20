import { ChevronLeft, ChevronRight, Edit3, Plus, Search, Trash2, X } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDeleteUsers } from '../api/hooks.jsx';
import { adminUsersQuery } from '../api/queries';
import { useConfirm } from './confirm.jsx';

export default function AdminUsersList() {
  const { requestConfirm } = useConfirm();
  const { data } = useQuery(adminUsersQuery());
  const users = data ?? [];
  const [selected, setSelected] = useState([]);
  const [params, setParams] = useSearchParams();
  const search = params.get('search') || '';
  const role = params.get('role') || '';
  const plan = params.get('plan') || '';
  const pageSize = [10, 25, 50].includes(Number(params.get('pageSize'))) ? Number(params.get('pageSize')) : 10;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const removeUsers = useDeleteUsers();
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return users.filter((user) => {
      const premium = user.subscription?.hasFullAccess === true;
      return (!term || `${user.username} ${user.email}`.toLocaleLowerCase().includes(term)) &&
        (!role || user.role === role) && (!plan || (plan === 'premium') === premium);
    });
  }, [users, search, role, plan]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function deleteUsers(ids) {
    removeUsers.mutate(ids, { onSuccess: () => setSelected([]) });
  }

  function toggle(id) {
    setSelected((value) => value.includes(id) ? value.filter((item) => item !== id) : [...value, id]);
  }

  function toggleAll() {
    const visibleIds = visible.map((user) => user.id);
    setSelected((value) => visibleIds.every((id) => value.includes(id)) ? value.filter((id) => !visibleIds.includes(id)) : [...new Set([...value, ...visibleIds])]);
  }

  function updateFilters(changes) {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([key, value]) => value ? next.set(key, String(value)) : next.delete(key));
    setParams(next, { replace: true });
  }

  const allSelected = Boolean(visible.length && visible.every((user) => selected.includes(user.id)));

  return (
    <div className="admin-users">
      <div className="admin-table-wrap">
        <div className="admin-list-head">
          <div><span className="admin-section-kicker">Account management</span><h2>Users</h2><p>{users.length} registered account{users.length === 1 ? '' : 's'} · {selected.length} selected</p></div>
          <div className="admin-actions">
            <Link className="primary" to="/users/new">
              <Plus size={16} /> Add user
            </Link>
            <button
              className="danger"
              disabled={!selected.length}
              onClick={() =>
                requestConfirm({
                  title: 'Delete selected users?',
                  body: `Delete ${selected.length} selected user${selected.length === 1 ? '' : 's'}?`,
                  actionLabel: 'Delete',
                  danger: true,
                  onConfirm: () => deleteUsers(selected)
                })
              }
            >
              <Trash2 size={16} /> Delete selected
            </button>
          </div>
        </div>
        <div className="admin-filter-bar admin-user-filters">
          <label className="admin-search-box"><Search size={17} /><input value={search} onChange={(event) => updateFilters({ search: event.target.value, page: 1 })} placeholder="Search name or email…" />{search ? <button aria-label="Clear search" onClick={() => updateFilters({ search: '', page: 1 })}><X size={15} /></button> : null}</label>
          <label className="admin-filter-field"><span>Role</span><select value={role} onChange={(event) => updateFilters({ role: event.target.value, page: 1 })}><option value="">All roles</option><option value="user">User</option><option value="admin">Admin</option></select></label>
          <label className="admin-filter-field"><span>Plan</span><select value={plan} onChange={(event) => updateFilters({ plan: event.target.value, page: 1 })}><option value="">All plans</option><option value="free">Free</option><option value="premium">Premium</option></select></label>
          <label className="admin-filter-field compact"><span>Rows</span><select value={pageSize} onChange={(event) => updateFilters({ pageSize: event.target.value, page: 1 })}><option value="10">10</option><option value="25">25</option><option value="50">50</option></select></label>
        </div>
        <div className="admin-result-bar"><span><strong>{filtered.length}</strong> results · {selected.length} selected</span><span>Page {currentPage} of {pages}</span></div>
        <table className="admin-table">
          <thead><tr><th><input type="checkbox" checked={allSelected} onChange={toggleAll} /></th><th>Username</th><th>Email</th><th>Role</th><th>Plan</th><th>Language</th><th>Created</th><th></th></tr></thead>
          <tbody>
            {visible.map((user) => (
              <tr key={user.id}>
                <td><input type="checkbox" checked={selected.includes(user.id)} onChange={() => toggle(user.id)} /></td>
                <td>{user.username}</td>
                <td>{user.email}</td>
                <td>{user.role}</td>
                <td><span className={`subscription-badge ${user.subscription?.hasFullAccess ? 'premium' : ''}`}>{user.subscription?.hasFullAccess ? 'Premium' : 'Free'}</span></td>
                <td>{user.language?.toUpperCase()}</td>
                <td>{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '-'}</td>
                <td>
                  <Link to={`/users/${user.id}`}><Edit3 size={15} /></Link>
                  <button
                    className="danger"
                    onClick={() =>
                      requestConfirm({
                        title: 'Delete user?',
                        body: `Delete ${user.email}?`,
                        actionLabel: 'Delete',
                        danger: true,
                        onConfirm: () => deleteUsers([user.id])
                      })
                    }
                  ><Trash2 size={15} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length ? <div className="admin-table-empty"><Search size={22} /><strong>No users found</strong><span>Try a different search or filter.</span></div> : null}
        {filtered.length > pageSize ? <div className="admin-pagination"><span>Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length}</span><div><button disabled={currentPage <= 1} onClick={() => updateFilters({ page: currentPage - 1 })}><ChevronLeft size={17} /> Previous</button><button disabled={currentPage >= pages} onClick={() => updateFilters({ page: currentPage + 1 })}>Next <ChevronRight size={17} /></button></div></div> : null}
      </div>
    </div>
  );
}
