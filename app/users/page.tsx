'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useQuals } from '@/lib/useQuals';

interface AppUser {
  id: string;
  username: string;
  email: string;
  display_name?: string;
  role: 'sm' | 'admin';
  is_active: number;
  last_login?: string;
  created_at: string;
  qualifications?: string;
  phone?: string;
  emergency_contact?: string;
  emergency_phone?: string;
  personnel_id?: string;
}

function fmtDate(dt?: string) {
  if (!dt) return 'Never';
  return new Date(dt).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

function QualChips({
  value, onChange, qualList,
}: { value: string; onChange: (v: string) => void; qualList: string[] }) {
  const active = value.split(',').map(s => s.trim()).filter(Boolean);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 4 }}>
      {qualList.map(q => {
        const on = active.includes(q);
        return (
          <button key={q} type="button"
            onClick={() => {
              const next = on ? active.filter(x => x !== q) : [...active, q];
              onChange(next.join(', '));
            }}
            style={{ padding: '2px 10px', borderRadius: 12, fontSize: 12, border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, background: on ? 'rgba(59,130,246,0.15)' : 'transparent', color: on ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.1s' }}>
            {q}
          </button>
        );
      })}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', borderRadius: 6,
  border: '1px solid var(--border)', background: 'var(--surface2)',
  color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box',
};

const inlineInputStyle: React.CSSProperties = {
  ...inputStyle, background: 'var(--surface)',
};

export default function UsersPage() {
  const { user, loading, authFetch } = useAuth();
  const router = useRouter();
  const { all: qualList } = useQuals();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ username: '', password: '', display_name: '', role: 'sm' as 'sm' | 'admin', qualifications: '', phone: '' });
  const [addSaving, setAddSaving] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<AppUser & { newPassword: string }>>({});
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading]);

  async function load() {
    setFetching(true);
    try {
      const res = await authFetch('/api/users');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setUsers(data.users ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load users');
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => { if (user) load(); }, [user]);

  function flash(m: string) { setMsg(m); setTimeout(() => setMsg(''), 3500); }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setAddSaving(true); setError('');
    try {
      const res = await authFetch('/api/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: addForm.username.trim(),
          password: addForm.password,
          displayName: addForm.display_name.trim() || addForm.username.trim(),
          role: addForm.role,
          qualifications: addForm.qualifications || null,
          phone: addForm.phone || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAddForm({ username: '', password: '', display_name: '', role: 'sm', qualifications: '', phone: '' });
      setShowAdd(false);
      flash(`User "${addForm.username}" created.`);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create user');
    } finally {
      setAddSaving(false);
    }
  }

  async function saveEdit(u: AppUser) {
    setEditSaving(true); setError('');
    try {
      const payload: Record<string, unknown> = {};
      if (editForm.display_name !== undefined)   payload.displayName     = editForm.display_name || null;
      if (editForm.role !== undefined)            payload.role            = editForm.role;
      if (editForm.qualifications !== undefined)  payload.qualifications  = editForm.qualifications || null;
      if (editForm.phone !== undefined)           payload.phone           = editForm.phone || null;
      if (editForm.emergency_contact !== undefined) payload.emergencyContact = editForm.emergency_contact || null;
      if (editForm.emergency_phone !== undefined)   payload.emergencyPhone  = editForm.emergency_phone || null;
      if ((editForm as any).newPassword)          payload.password        = (editForm as any).newPassword;

      const res = await authFetch(`/api/users/${u.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEditId(null);
      flash('User updated.');
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update');
    } finally {
      setEditSaving(false);
    }
  }

  async function toggleActive(u: AppUser) {
    const res = await authFetch(`/api/users/${u.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !u.is_active }),
    });
    if (res.ok) { flash(u.is_active ? `${u.username} disabled.` : `${u.username} enabled.`); load(); }
  }

  async function deleteUser(u: AppUser) {
    if (!confirm(`Delete "${u.username}"? This cannot be undone.`)) return;
    const res = await authFetch(`/api/users/${u.id}`, { method: 'DELETE' });
    if (res.ok) { flash(`User "${u.username}" deleted.`); load(); }
    else { const d = await res.json(); setError(d.error ?? 'Delete failed'); }
  }

  if (loading || !user) return null;

  return (
    <div className="app-content panel">
      <div style={{ maxWidth: 920 }}>
        <div className="page-header">
          <h1 className="page-title">User Management</h1>
          <button onClick={() => { setShowAdd(v => !v); setError(''); }} className="btn btn-primary">
            {showAdd ? 'Cancel' : '+ New User'}
          </button>
        </div>

        {error && (
          <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, color: 'var(--danger)', fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}
        {msg && (
          <div style={{ padding: '10px 14px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 6, color: 'var(--success)', fontSize: 13, marginBottom: 16 }}>
            {msg}
          </div>
        )}

        {/* ── Add User Form ── */}
        {showAdd && (
          <form onSubmit={createUser} className="card" style={{ marginBottom: 20 }}>
            <div className="card-title">New User</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 14 }}>
              <div>
                <label className="form-label">Username *</label>
                <input value={addForm.username} onChange={e => setAddForm(f => ({ ...f, username: e.target.value }))}
                  required autoComplete="off" style={inputStyle} />
              </div>
              <div>
                <label className="form-label">Password *</label>
                <input type="password" value={addForm.password} onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))}
                  required autoComplete="new-password" style={inputStyle} />
              </div>
              <div>
                <label className="form-label">Display Name</label>
                <input value={addForm.display_name} onChange={e => setAddForm(f => ({ ...f, display_name: e.target.value }))}
                  placeholder="Full name" style={inputStyle} />
              </div>
              <div>
                <label className="form-label">Role</label>
                <select value={addForm.role} onChange={e => setAddForm(f => ({ ...f, role: e.target.value as 'sm' | 'admin' }))} style={inputStyle}>
                  <option value="sm">SM (Search Manager)</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="form-label">Phone</label>
                <input type="tel" value={addForm.phone} onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))} style={inputStyle} />
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label className="form-label">Qualifications</label>
              <QualChips value={addForm.qualifications} onChange={v => setAddForm(f => ({ ...f, qualifications: v }))} qualList={qualList} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setShowAdd(false)} className="btn btn-ghost btn-sm">Cancel</button>
              <button type="submit" disabled={addSaving} className="btn btn-primary btn-sm">
                {addSaving ? 'Creating…' : 'Create User'}
              </button>
            </div>
          </form>
        )}

        {/* ── Users Table ── */}
        {fetching ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="sar-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Qualifications</th>
                  <th>Last Login</th>
                  <th>Status</th>
                  <th style={{ width: 140 }}></th>
                </tr>
              </thead>
              <tbody>
                {users.map(u =>
                  editId === u.id ? (
                    <tr key={u.id}>
                      <td colSpan={6} style={{ padding: 0 }}>
                        <div style={{ padding: 16, background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10, marginBottom: 12 }}>
                            {[
                              { label: 'Display Name', key: 'display_name', fallback: u.display_name ?? '', type: 'text' },
                              { label: 'Phone', key: 'phone', fallback: u.phone ?? '', type: 'tel' },
                              { label: 'Emergency Contact', key: 'emergency_contact', fallback: u.emergency_contact ?? '', type: 'text' },
                              { label: 'Emergency Phone', key: 'emergency_phone', fallback: u.emergency_phone ?? '', type: 'tel' },
                              { label: 'New Password', key: 'newPassword', fallback: '', type: 'password', placeholder: 'Leave blank to keep' },
                            ].map(({ label, key, fallback, type, placeholder }) => (
                              <div key={key}>
                                <label className="form-label">{label}</label>
                                <input type={type}
                                  value={(editForm as any)[key] ?? fallback}
                                  onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                                  placeholder={placeholder}
                                  autoComplete={key === 'newPassword' ? 'new-password' : undefined}
                                  style={inlineInputStyle} />
                              </div>
                            ))}
                            <div>
                              <label className="form-label">Role</label>
                              <select value={editForm.role ?? u.role}
                                onChange={e => setEditForm(f => ({ ...f, role: e.target.value as 'sm' | 'admin' }))}
                                style={inlineInputStyle}>
                                <option value="sm">SM</option>
                                <option value="admin">Admin</option>
                              </select>
                            </div>
                          </div>
                          <div style={{ marginBottom: 14 }}>
                            <label className="form-label">Qualifications</label>
                            <QualChips
                              value={editForm.qualifications ?? u.qualifications ?? ''}
                              onChange={v => setEditForm(f => ({ ...f, qualifications: v }))}
                              qualList={qualList}
                            />
                          </div>
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button onClick={() => setEditId(null)} className="btn btn-ghost btn-sm">Cancel</button>
                            <button onClick={() => saveEdit(u)} disabled={editSaving} className="btn btn-primary btn-sm">
                              {editSaving ? 'Saving…' : 'Save'}
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={u.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{u.display_name || u.username}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          @{u.username}{u.phone ? ` · ${u.phone}` : ''}
                        </div>
                      </td>
                      <td>
                        <span className="badge" style={
                          u.role === 'admin'
                            ? { background: 'rgba(239,68,68,0.15)', color: 'var(--danger)' }
                            : { background: 'rgba(59,130,246,0.15)', color: 'var(--accent)' }
                        }>
                          {u.role === 'admin' ? 'Admin' : 'SM'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {(u.qualifications ?? '').split(',').map(q => q.trim()).filter(Boolean).map(q => (
                            <span key={q} style={{ fontSize: 11, padding: '1px 8px', borderRadius: 10, background: 'rgba(59,130,246,0.12)', color: 'var(--accent)' }}>{q}</span>
                          ))}
                          {!u.qualifications && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                        </div>
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                        {fmtDate(u.last_login)}
                      </td>
                      <td>
                        <span className={`badge badge-${u.is_active ? 'active' : 'closed'}`}>
                          {u.is_active ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          <button onClick={() => { setEditId(u.id); setEditForm({}); }}
                            style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>
                            Edit
                          </button>
                          {u.username !== 'admin' && (
                            <>
                              <button onClick={() => toggleActive(u)}
                                style={{ fontSize: 12, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
                                {u.is_active ? 'Disable' : 'Enable'}
                              </button>
                              <button onClick={() => deleteUser(u)}
                                style={{ fontSize: 12, color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}>
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                )}
                {users.length === 0 && !fetching && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>No users found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>
          {users.length} user{users.length !== 1 ? 's' : ''} · Display name and qualifications sync automatically to the personnel roster.
        </p>
      </div>
    </div>
  );
}
