'use client';

import { Edit3, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDeleteUsers } from '../api/hooks.jsx';
import { adminUsersQuery } from '../api/queries';
import { useConfirm } from './confirm.jsx';

export default function AdminUsersList() {
  const { requestConfirm } = useConfirm();
  const { data } = useQuery(adminUsersQuery());
  const users = data ?? [];
  const [selected, setSelected] = useState([]);
  const removeUsers = useDeleteUsers();

  function deleteUsers(ids) {
    removeUsers.mutate(ids, { onSuccess: () => setSelected([]) });
  }

  function toggle(id) {
    setSelected((value) => value.includes(id) ? value.filter((item) => item !== id) : [...value, id]);
  }

  function toggleAll() {
    setSelected((value) => (value.length === users.length ? [] : users.map((user) => user.id)));
  }

  const allSelected = Boolean(users.length && selected.length === users.length);

  return (
    <div className="admin-users">
      <div className="admin-table-wrap">
        <div className="admin-list-head">
          <div><span className="admin-section-kicker">Account management</span><h2>Users</h2><p>{users.length} registered account{users.length === 1 ? '' : 's'} · {selected.length} selected</p></div>
          <div className="admin-actions">
            <Link className="primary" href="/admin/users/new">
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
        <table className="admin-table">
          <thead><tr><th><input type="checkbox" checked={allSelected} onChange={toggleAll} /></th><th>Username</th><th>Email</th><th>Role</th><th>Plan</th><th>Language</th><th>Created</th><th></th></tr></thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td><input type="checkbox" checked={selected.includes(user.id)} onChange={() => toggle(user.id)} /></td>
                <td>{user.username}</td>
                <td>{user.email}</td>
                <td>{user.role}</td>
                <td><span className={`subscription-badge ${user.subscription?.hasFullAccess ? 'premium' : ''}`}>{user.subscription?.hasFullAccess ? 'Premium' : 'Free'}</span></td>
                <td>{user.language?.toUpperCase()}</td>
                <td>{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '-'}</td>
                <td>
                  <Link href={`/admin/users/${user.id}`}><Edit3 size={15} /></Link>
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
      </div>
    </div>
  );
}
