import { AppIcon } from '../ui/AppIcon';
import { useState } from 'react';
import { api, ApiError } from '../api';
import { T } from '../strings.th';
import { useStore, type Me } from '../store';

export async function refreshMe() {
  try {
    const r = await api<{ user: Me; avatar: any }>('GET', '/api/auth/me');
    useStore.getState().set({ me: r.user, myAvatar: r.avatar, authReady: true });
  } catch {
    useStore.getState().set({ me: null, authReady: true });
  }
}

export function Login() {
  const [u, setU] = useState(''), [p, setP] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const kicked = useStore((s) => s.kickedReason);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    useStore.getState().set({ kickedReason: null });
    setBusy(true); setErr('');
    try { await api('POST', '/api/auth/login', { username: u, password: p }); await refreshMe(); }
    catch (x) { setErr(x instanceof ApiError ? (x.status === 429 ? T.loginLocked : x.status === 0 ? T.errorNetwork : T.loginInvalid) : T.errorGeneric); }
    finally { setBusy(false); }
  };
  return (
    <div className="center-page">
      <form className="panel" onSubmit={submit}>
        <h1 className="brand"><AppIcon /> {T.appName}</h1>
        <label>{T.username}<input autoFocus autoComplete="username" autoCapitalize="none" value={u} onChange={(e) => setU(e.target.value)} /></label>
        <label>{T.password}<input type="password" autoComplete="current-password" value={p} onChange={(e) => setP(e.target.value)} /></label>
        {(kicked && !err) && <p className="error">{T.kicked[kicked] ?? T.kicked.default}</p>}
        {err && <p className="error">{err}</p>}
        <button className="primary" disabled={busy || !u || !p}><span aria-hidden="true">🔑</span> {T.login}</button>
      </form>
    </div>
  );
}

export function ChangePassword({ forced, onDone }: { forced: boolean; onDone?: () => void }) {
  const [cur, setCur] = useState(''), [n1, setN1] = useState(''), [n2, setN2] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (n1.length < 8) return setErr(T.pwShort);
    if (n1 !== n2) return setErr(T.pwMismatch);
    setBusy(true); setErr('');
    try {
      await api('POST', '/api/auth/change-password', { current: cur, next: n1 });
      await refreshMe();
      onDone?.();
    } catch (x) {
      const code = x instanceof ApiError ? x.code : '';
      setErr(code === 'wrong_password' ? T.pwWrong : code === 'same_password' ? T.pwSame : T.errorGeneric);
    } finally { setBusy(false); }
  };
  return (
    <div className="center-page">
      <form className="panel" onSubmit={submit}>
        <h1>{T.changePwTitle}</h1>
        {forced && <p className="muted">{T.changePwForced}</p>}
        <label>{T.currentPw}<input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></label>
        <label>{T.newPw}<input type="password" autoComplete="new-password" value={n1} onChange={(e) => setN1(e.target.value)} /></label>
        <label>{T.confirmPw}<input type="password" autoComplete="new-password" value={n2} onChange={(e) => setN2(e.target.value)} /></label>
        {err && <p className="error">{err}</p>}
        <div className="row">
          {!forced && <button type="button" className="ghost" onClick={onDone}><span aria-hidden="true">✕</span> {T.cancel}</button>}
          <button className="primary" disabled={busy || !cur || !n1}><span aria-hidden="true">💾</span> {T.save}</button>
          {forced && <button type="button" className="danger" onClick={async () => { await api('POST', '/api/auth/logout'); await refreshMe(); }}><span aria-hidden="true">🚪</span> {T.logout}</button>}
        </div>
      </form>
    </div>
  );
}
