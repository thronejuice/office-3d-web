import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { T } from '../strings.th';
import { toast, useStore } from '../store';
import { navigate } from '../router';
import { Modal } from '../ui/Modal';

interface U { id: string; username: string; displayName: string; department: string; jobTitle: string; role: 'admin' | 'member'; disabled: boolean }
const blank = { username: '', password: '', displayName: '', department: '', jobTitle: '', role: 'member' as 'admin' | 'member' };
const msg = (e: unknown) => (e instanceof ApiError ? T.errors[e.code] ?? e.body?.message ?? T.errorGeneric : T.errorGeneric);

export default function Admin() {
  const [users, setUsers] = useState<U[]>([]);
  const [form, setForm] = useState<(typeof blank & { id?: string }) | null>(null);
  const [reset, setReset] = useState<{ id: string; password: string } | null>(null);
  const [err, setErr] = useState('');
  const meId = useStore((s) => s.me?.id);
  const load = useCallback(() => api<{ users: U[] }>('GET', '/api/admin/users').then((r) => setUsers(r.users)), []);
  useEffect(() => void load(), [load]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setErr('');
    try { await fn(); toast(ok, { ms: 2500 }); await load(); return true; }
    catch (e) { setErr(msg(e)); return false; }
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const f = form!;
    const done = f.id
      ? await run(() => api('PATCH', `/api/admin/users/${f.id}`, { displayName: f.displayName, department: f.department, jobTitle: f.jobTitle, role: f.role }), T.userSaved)
      : await run(() => api('POST', '/api/admin/users', f), T.userCreated);
    if (done) setForm(null);
  };

  return (
    <div className="page">
      <header>
        <button className="secondary" onClick={() => navigate('/')}><span aria-hidden="true">←</span> {T.back}</button>
        <h1 style={{ margin: 0 }} className="grow">{T.adminUsers}</h1>
        <button className="primary" onClick={() => setForm({ ...blank })}><span aria-hidden="true">➕</span> {T.addUser}</button>
      </header>
      {err && <p className="error" role="alert">{err}</p>}
      <div className="tablewrap">
        <table>
          <thead><tr><th>{T.username}</th><th>{T.displayName}</th><th>{T.department}</th><th>{T.jobTitle}</th><th>{T.role}</th><th /></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ opacity: u.disabled ? 0.55 : 1 }}>
                <td>{u.username}</td><td>{u.displayName} {u.disabled && <span className="error small">({T.disabled})</span>}</td>
                <td>{u.department}</td><td>{u.jobTitle}</td><td>{T.roles[u.role]}</td>
                <td><div className="row">
                  <button className="secondary small" aria-label={T.editUser(u.displayName)} onClick={() => setForm({ ...blank, ...u })}><span aria-hidden="true">✏️</span> {T.edit}</button>
                  <button className="secondary small" aria-label={T.resetUser(u.displayName)} onClick={() => setReset({ id: u.id, password: '' })}><span aria-hidden="true">🔄</span> {T.resetPassword}</button>
                  {u.id !== meId && (
                    <button className={`${u.disabled ? 'primary' : 'danger'} small`} aria-label={(u.disabled ? T.enableUser : T.disableUser)(u.displayName)} onClick={() => run(() => api('PATCH', `/api/admin/users/${u.id}`, { disabled: !u.disabled }), T.userSaved)}><span aria-hidden="true">{u.disabled ? '✅' : '⛔'}</span> {u.disabled ? T.enable : T.disable}</button>
                  )}
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {form && (
        <Modal onClose={() => setForm(null)} titleId="user-form-heading">
          <form className="panel" onSubmit={submit}>
            <h1 id="user-form-heading">{form.id ? T.edit : T.addUser}</h1>
            <div className="formgrid">
              {!form.id && <label>{T.username}<input value={form.username} autoCapitalize="none" onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>}
              {!form.id && <label>{T.tempPassword}<input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>}
              <label>{T.displayName}<input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></label>
              <label>{T.department}<input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></label>
              <label>{T.jobTitle}<input value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} /></label>
              <label>{T.role}<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as any })}><option value="member">{T.roles.member}</option><option value="admin">{T.roles.admin}</option></select></label>
            </div>
            {err && <p className="error" role="alert">{err}</p>}
            <div className="row end">
              <button type="button" className="ghost" onClick={() => setForm(null)}><span aria-hidden="true">✕</span> {T.cancel}</button>
              <button className="primary"><span aria-hidden="true">{form.id ? '💾' : '➕'}</span> {form.id ? T.save : T.create}</button>
            </div>
          </form>
        </Modal>
      )}

      {reset && (
        <Modal onClose={() => setReset(null)} titleId="reset-heading">
          <form className="panel" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api('POST', `/api/admin/users/${reset.id}/reset-password`, { password: reset.password }), T.resetDone)) setReset(null); }}>
            <h1 id="reset-heading">{T.resetPassword}</h1>
            <label>{T.newTempPassword}<input value={reset.password} onChange={(e) => setReset({ ...reset, password: e.target.value })} /></label>
            {err && <p className="error" role="alert">{err}</p>}
            <div className="row end">
              <button type="button" className="ghost" onClick={() => setReset(null)}><span aria-hidden="true">✕</span> {T.cancel}</button>
              <button className="primary"><span aria-hidden="true">✔️</span> {T.confirm}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
