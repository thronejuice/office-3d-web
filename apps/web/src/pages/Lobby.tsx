import { Suspense, lazy, useEffect, useState } from 'react';
import type { MapData } from '@office3d/shared';
import { api } from '../api';
import { T } from '../strings.th';
import { useStore } from '../store';
import { Customizer } from '../ui/Customizer';
import { ChangePassword, refreshMe } from './Auth';
import { voice } from '../game/voice';
import { connectOffice } from '../game/net';
import { navigate } from '../router';

const LobbyBackdrop = lazy(() => import('../ui/LobbyBackdrop'));

type MicPre = 'unknown' | 'prompt' | 'granted' | 'denied' | 'none' | 'insecure';

/** Reads mic permission without asking for it or opening the mic. Safari may not support the query: stays 'unknown'. */
function useMicPre(): MicPre {
  const [st, setSt] = useState<MicPre>('unknown');
  useEffect(() => {
    if (!window.isSecureContext) return setSt('insecure');
    if (!navigator.mediaDevices?.getUserMedia) return setSt('none');
    let perm: PermissionStatus | undefined;
    const read = () => perm && setSt(perm.state as MicPre);
    navigator.permissions?.query({ name: 'microphone' as PermissionName }).then((p) => { perm = p; read(); p.onchange = read; }).catch(() => {});
    return () => { if (perm) perm.onchange = null; };
  }, []);
  return st;
}

const Icon = ({ d }: { d: string }) => (
  <svg className="mic-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const MIC = 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM6 11a6 6 0 0 0 12 0M12 17v4';
const MIC_OFF = 'M4 4l16 16M9 9v3a3 3 0 0 0 5 2M15 10V6a3 3 0 0 0-5.5-1.7M6 11a6 6 0 0 0 9 5M12 17v4';
const MIC_OK = 'M5 13l4 4L19 7';

function MicStatus({ st }: { st: MicPre }) {
  const blocked = st === 'denied' || st === 'none' || st === 'insecure';
  const text = st === 'granted' ? T.micReady : st === 'denied' ? T.micBlocked : st === 'none' ? T.micNone : st === 'insecure' ? T.micInsecure : st === 'prompt' ? T.micPrompt : T.micNote;
  return (
    <div className={`mic-status ${blocked ? 'blocked' : ''}`} role="status">
      <Icon d={blocked ? MIC_OFF : st === 'granted' ? MIC_OK : MIC} />
      <div>
        <div>{text}</div>
        {st === 'denied' && <div className="small muted">{T.micBlockedHow}</div>}
        {(st === 'granted' || st === 'prompt') && !matchMedia('(pointer: coarse)').matches && <div className="small muted">{T.micMuteHint}</div>}
      </div>
    </div>
  );
}

export function Lobby() {
  const me = useStore((s) => s.me)!;
  const avatar = useStore((s) => s.myAvatar);
  const kicked = useStore((s) => s.kickedReason);
  const [editing, setEditing] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [map, setMap] = useState<MapData | null>(null);
  const mic = useMicPre();

  useEffect(() => { api<{ map: MapData }>('GET', '/api/map').then((r) => setMap(r.map)).catch(() => {}); }, []);

  // A disabled or reset account has no valid session any more: go back to the login screen.
  useEffect(() => { if (kicked === 'disabled' || kicked === 'password_reset') void refreshMe(); }, [kicked]);

  // Mic permission and AudioContext must be started from this click (iOS Safari requires a user gesture).
  const enter = async () => {
    setBusy(true);
    useStore.getState().set({ kickedReason: null });
    try { await voice.init(); } finally { setBusy(false); }
    connectOffice();
  };

  if (changingPw) return <ChangePassword forced={false} onDone={() => setChangingPw(false)} />;
  if (editing || !avatar)
    return (
      <div className="center-page">
        <div className="panel wide">
          <h1>{T.customize}</h1>
          {!avatar && <p className="muted">{T.customizeFirst}</p>}
          <Customizer initial={avatar} onDone={() => setEditing(false)} onCancel={avatar ? () => setEditing(false) : undefined} />
        </div>
      </div>
    );
  return (
    <div className="center-page lobby">
      {map && <Suspense fallback={null}><LobbyBackdrop map={map} /></Suspense>}
      <div className="panel lobby-panel">
        <div className="lobby-head">
          <span className="swatch" style={{ background: avatar.topColor, borderColor: avatar.skin }} aria-hidden="true" />
          <h1>{T.lobbyHello(me.displayName)}</h1>
        </div>
        {kicked && <p className="error" role="alert">{T.kicked[kicked] ?? T.kicked.default}</p>}
        <button className="primary big" autoFocus disabled={busy} onClick={enter}>
          <span aria-hidden="true">{busy ? '⏳' : '🏢'}</span> {busy ? T.entering : T.enterOffice}
        </button>
        <MicStatus st={mic} />
        <h3>{T.moreActions}</h3>
        <div className="row">
          <button className="secondary" onClick={() => setEditing(true)}><span aria-hidden="true">🎨</span> {T.customize}</button>
          <button className="secondary" onClick={() => setChangingPw(true)}><span aria-hidden="true">🔑</span> {T.changePassword}</button>
        </div>
        {me.role === 'admin' && (
          <>
            <h3>{T.adminTools}</h3>
            <div className="row">
              <button className="secondary" onClick={() => navigate('/admin')}><span aria-hidden="true">👥</span> {T.adminPanel}</button>
              <button className="secondary" onClick={() => navigate('/admin/map')}><span aria-hidden="true">🗺️</span> {T.mapEditor}</button>
            </div>
          </>
        )}
        <div className="row end">
          <button className="danger" onClick={async () => { await api('POST', '/api/auth/logout'); await refreshMe(); }}><span aria-hidden="true">🚪</span> {T.logout}</button>
        </div>
      </div>
    </div>
  );
}
