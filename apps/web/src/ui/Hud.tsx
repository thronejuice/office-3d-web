import { useEffect, useMemo, useRef, useState } from 'react';
import { AWAY_AFTER_MS, EMOTES, type Emote, type Status } from '@office3d/shared';
import { T } from '../strings.th';
import { dismissToast, seatedTable, stepRot, stepZoom, toast, useStore, type Panel } from '../store';
import { clearMissed, leaveOffice, sendEmote, sendMuted, sendStatus, walkToPerson } from '../game/net';
import { voice } from '../game/voice';
import { input } from '../game/input';
import { live } from '../game/live';
import { Modal } from './Modal';
import { Customizer } from './Customizer';
import { DeskEdit } from './DeskEdit';
import { GamePanel, NearTableButton } from './GamePanel';
import { MusicBar } from './MusicBar';
import { ChangePassword } from '../pages/Auth';
import { navigate } from '../router';

const EMOJI: Record<Emote, string> = { wave: '👋', clap: '👏', thumbsup: '👍', raisehand: '✋' };
const MANUAL: Status[] = ['available', 'busy', 'dnd'];

/** Keyboard shortcuts, activity tracking and automatic away. */
export function useOfficeInput() {
  useEffect(() => {
    let autoPrev: Status | null = null;
    const me = () => useStore.getState().people[useStore.getState().selfId ?? ''];
    const goAway = () => {
      const m = me();
      if (m && autoPrev === null && (m.status === 'available' || m.status === 'busy')) { autoPrev = m.status; sendStatus('away'); }
    };
    const back = () => { if (autoPrev !== null) { const p = autoPrev; autoPrev = null; sendStatus(p); } };
    const activity = () => { input.lastActivity = Date.now(); back(); };
    const typing = (e: Event) => ['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName);
    const down = (e: KeyboardEvent) => {
      activity();
      if (typing(e) || e.ctrlKey || e.metaKey) return;
      if (e.code === 'KeyM') toggleMute();
      else if (e.code === 'Equal' || e.code === 'NumpadAdd') stepZoom(1);
      else if (e.code === 'Minus' || e.code === 'NumpadSubtract') stepZoom(-1);
      else if (e.code === 'KeyQ') stepRot(-1);
      else if (e.code === 'KeyE') stepRot(1);
      else if (/^Digit[1-4]$/.test(e.code)) sendEmote(EMOTES[Number(e.code.slice(5)) - 1]);
      else input.keys.add(e.code);
    };
    const up = (e: KeyboardEvent) => input.keys.delete(e.code);
    const vis = () => (document.hidden ? goAway() : activity());
    const timer = setInterval(() => { if (Date.now() - input.lastActivity > AWAY_AFTER_MS) goAway(); }, 5000);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', () => input.keys.clear());
    for (const ev of ['pointerdown', 'pointermove', 'touchstart', 'wheel']) window.addEventListener(ev, activity, { passive: true });
    document.addEventListener('visibilitychange', vis);
    // A manual status change while auto-away cancels the automatic restore.
    const unsub = useStore.subscribe((s, p) => {
      const id = s.selfId;
      if (id && s.people[id]?.status !== p.people[id]?.status && s.people[id]?.status !== 'away' && autoPrev !== null) autoPrev = null;
    });
    return () => {
      clearInterval(timer);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      for (const ev of ['pointerdown', 'pointermove', 'touchstart', 'wheel']) window.removeEventListener(ev, activity);
      document.removeEventListener('visibilitychange', vis);
      unsub();
      input.keys.clear();
    };
  }, []);
}

export function toggleMute() {
  const st = useStore.getState();
  if (st.micState !== 'on') return;
  const self = st.people[st.selfId ?? ''];
  sendMuted(!self?.muted);
}

function Joystick() {
  const knob = useRef<HTMLDivElement>(null);
  const base = useRef<HTMLDivElement>(null);
  const active = useRef<number | null>(null);
  const move = (e: React.PointerEvent) => {
    const r = base.current!.getBoundingClientRect();
    const R = r.width / 2;
    let dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R);
    const len = Math.hypot(dx, dy);
    if (len > R) { dx = (dx / len) * R; dy = (dy / len) * R; }
    input.joy.x = dx / R; input.joy.y = dy / R;
    knob.current!.style.transform = `translate(${dx}px,${dy}px)`;
  };
  const end = () => { active.current = null; input.joy.x = input.joy.y = 0; if (knob.current) knob.current.style.transform = ''; };
  return (
    <div
      ref={base} className="joystick"
      onPointerDown={(e) => { active.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); live.cancelWalk(); move(e); }}
      onPointerMove={(e) => active.current === e.pointerId && move(e)}
      onPointerUp={end} onPointerCancel={end}
    >
      <div ref={knob} className="knob" />
    </div>
  );
}

function OnlineList() {
  const people = useStore((s) => s.people);
  const selfId = useStore((s) => s.selfId)!;
  const map = useStore((s) => s.map);
  const [q, setQ] = useState('');
  const rows = useMemo(
    () => Object.values(people).filter((p) => p.user.displayName.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.user.displayName.localeCompare(b.user.displayName, 'th')),
    [people, q],
  );
  const me = people[selfId];
  return (
    <div className="panel-body">
      <h2>{T.onlineList} ({Object.keys(people).length})</h2>
      <div className="seg">
        {MANUAL.map((s) => (
          <button key={s} className={me?.status === s ? 'on' : ''} onClick={() => sendStatus(s)}><span className={`dot s-${s}`} role="img" title={T.status[s]} aria-label={T.status[s]} /> {T.status[s]}</button>
        ))}
      </div>
      <input placeholder={T.search} value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="people">
        {rows.map((p) => {
          const isSelf = p.user.id === selfId;
          return (
            <li key={p.user.id}>
              {isSelf ? (
                <div className="person-row is-self">
                  <span className="swatch" style={{ background: p.avatar.topColor, borderColor: p.avatar.skin }} aria-hidden="true" />
                  <div className="grow">
                    <strong>{p.user.displayName}</strong> <span className="muted">{T.you}</span>
                    <div className="muted small">{[p.user.department, p.user.jobTitle].filter(Boolean).join(' · ')}</div>
                    {p.zone && <div className="small">{T.inZone(map?.zones.find((z) => z.id === p.zone)?.name ?? '')}</div>}
                  </div>
                  {p.muted && <span role="img" title={T.muted} aria-label={T.muted}>🔇</span>}
                  <span className={`dot s-${p.status}`} role="img" title={T.status[p.status]} aria-label={T.status[p.status]} />
                </div>
              ) : (
                <button
                  type="button"
                  className="person-row person-btn"
                  onClick={() => walkToPerson(p.user.id)}
                  aria-label={`${T.walkTo} ${p.user.displayName}`}
                >
                  <span className="swatch" style={{ background: p.avatar.topColor, borderColor: p.avatar.skin }} aria-hidden="true" />
                  <div className="grow text-left">
                    <strong>{p.user.displayName}</strong>
                    <div className="muted small">{[p.user.department, p.user.jobTitle].filter(Boolean).join(' · ')}</div>
                    {p.zone && <div className="small">{T.inZone(map?.zones.find((z) => z.id === p.zone)?.name ?? '')}</div>}
                  </div>
                  {p.muted && <span role="img" title={T.muted} aria-label={T.muted}>🔇</span>}
                  <span aria-hidden="true" className="muted small" title={T.walkTo}>🚶</span>
                  <span className={`dot s-${p.status}`} role="img" title={T.status[p.status]} aria-label={T.status[p.status]} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Missed() {
  const missed = useStore((s) => s.missed);
  const people = useStore((s) => s.people);
  return (
    <div className="panel-body">
      <h2>{T.missedKnocks}</h2>
      {!missed.length && <p className="muted">{T.noMissed}</p>}
      <ul className="people">
        {missed.map((k) => (
          <li key={k.id}>
            <div className="grow"><strong>{k.fromName}</strong><div className="muted small">{new Date(k.at).toLocaleTimeString('th-TH')}</div></div>
            {people[k.fromId] && <button className="primary small" onClick={() => walkToPerson(k.fromId)}><span aria-hidden="true">🚶</span> {T.goTo}</button>}
          </li>
        ))}
      </ul>
      {!!missed.length && <button className="danger small" onClick={clearMissed}><span aria-hidden="true">🗑️</span> {T.clear}</button>}
    </div>
  );
}

function Devices() {
  const [list, setList] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => { navigator.mediaDevices?.enumerateDevices().then(setList).catch(() => {}); }, []);
  const mics = list.filter((d) => d.kind === 'audioinput'), outs = list.filter((d) => d.kind === 'audiooutput');
  const canSink = 'setSinkId' in HTMLMediaElement.prototype;
  return (
    <div className="panel-body">
      <h2>{T.devices}</h2>
      <label>{T.microphone}
        <select onChange={(e) => void voice.openMic(e.target.value || undefined)}>
          <option value="">{T.defaultDevice}</option>
          {mics.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId.slice(0, 8)}</option>)}
        </select>
      </label>
      {canSink && (
        <label>{T.speaker}
          <select onChange={(e) => void voice.setSink(e.target.value)}>
            <option value="">{T.defaultDevice}</option>
            {outs.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId.slice(0, 8)}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}

export function Hud() {
  const panel = useStore((s) => s.panel);
  const setStore = useStore((s) => s.set);
  const selfId = useStore((s) => s.selfId);
  const people = useStore((s) => s.people);
  const missed = useStore((s) => s.missed);
  const connected = useStore((s) => s.connected);
  const micState = useStore((s) => s.micState);
  const toasts = useStore((s) => s.toasts);
  const map = useStore((s) => s.map);
  const selectedId = useStore((s) => s.selectedId);
  const myAvatar = useStore((s) => s.myAvatar);
  const meRole = useStore((s) => s.me?.role);
  const zoomStep = useStore((s) => s.zoomStep);
  const seated = useStore((s) => !!seatedTable(s));

  const [menu, setMenu] = useState(false);
  const [emoteOpen, setEmoteOpen] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const [deskEditing, setDeskEditing] = useState(false);
  const [micBannerOff, setMicBannerOff] = useState(false);

  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const hasDesk = !!map?.desks.some((d) => d.userId === selfId);
  const self = people[selfId ?? ''];
  const coarse = useMemo(() => matchMedia('(pointer: coarse)').matches, []);
  const toggle = (p: Panel) => setStore({ panel: panel === p ? 'none' : p });
  const micMsg = micState === 'denied' ? [T.micDenied, T.micDeniedHelp] : micState === 'none' ? [T.micNone, ''] : micState === 'insecure' ? [T.micInsecure, ''] : null;

  useEffect(() => {
    if (!menu) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setMenu(false);
        menuBtnRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [menu]);

  return (
    <>
      <div className="topbar">
        <button className={`pill s-${self?.status}`} onClick={() => toggle('online')}>
          <span className={`dot s-${self?.status}`} role="img" title={T.status[self?.status ?? 'available']} aria-label={T.status[self?.status ?? 'available']} /> {T.status[self?.status ?? 'available']} · {Object.keys(people).length} 👥
        </button>
        <div className="grow" />
        {!!missed.length && <button className="pill alert" onClick={() => toggle('missed')}>🔔 {missed.length}</button>}
        <button
          ref={menuBtnRef}
          className="pill"
          onClick={() => setMenu((m) => !m)}
          aria-label={T.menu}
          aria-expanded={menu}
          aria-haspopup="menu"
        >
          ☰
        </button>
      </div>

      {menu && (
        <div className="menu" role="menu" onClick={() => setMenu(false)}>
          <button role="menuitem" onClick={() => setCustomizing(true)}><span aria-hidden="true">🎨</span> {T.customize}</button>
          <button role="menuitem" onClick={() => (hasDesk ? setDeskEditing(true) : toast(T.deskNone))}><span aria-hidden="true">🪑</span> {T.editMyDesk}</button>
          <button role="menuitem" onClick={() => toggle('devices')}><span aria-hidden="true">🎧</span> {T.devices}</button>
          <button role="menuitem" onClick={() => toggle('missed')}><span aria-hidden="true">🔔</span> {T.missedKnocks}</button>
          <button role="menuitem" onClick={() => setChangingPw(true)}><span aria-hidden="true">🔑</span> {T.changePassword}</button>
          {meRole === 'admin' && <button role="menuitem" onClick={() => { leaveOffice(); navigate('/admin/map'); }}><span aria-hidden="true">🗺️</span> {T.mapEditor}</button>}
          {meRole === 'admin' && <button role="menuitem" onClick={() => { leaveOffice(); navigate('/admin'); }}><span aria-hidden="true">👥</span> {T.adminPanel}</button>}
          <button role="menuitem" className="danger" onClick={leaveOffice}><span aria-hidden="true">🚪</span> {T.leaveOffice}</button>
        </div>
      )}

      {micMsg && !micBannerOff && (
        <div className="banner" role="alert" onClick={() => setMicBannerOff(true)}>
          <strong>{micMsg[0]}</strong> {micMsg[1]}
        </div>
      )}
      {!connected && <div className="banner warn" role="alert">{T.reconnecting}</div>}

      {panel !== 'none' && (
        <aside
          className="drawer"
          aria-label={
            panel === 'online'
              ? T.onlineList
              : panel === 'missed'
              ? T.missedKnocks
              : panel === 'devices'
              ? T.devices
              : 'Drawer'
          }
        >
          <button className="close" onClick={() => setStore({ panel: 'none' })} aria-label={T.close}>✕</button>
          {panel === 'online' && <OnlineList />}
          {panel === 'missed' && <Missed />}
          {panel === 'devices' && <Devices />}
        </aside>
      )}

      <div className="toasts" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <span>{t.text}</span>
            {t.onAction && <button onClick={t.onAction}>{t.actionLabel}</button>}
            <button className="ghost" onClick={() => dismissToast(t.id)} aria-label={T.close}>✕</button>
          </div>
        ))}
      </div>

      <div className="bottombar">
        <div className="zoom" role="group" aria-label={T.zoom}>
          <button className="round small-round" disabled={zoomStep >= 1} onClick={() => stepZoom(1)} aria-label={T.zoomIn} title={`${T.zoomIn} (+)`}>+</button>
          <button className="round small-round" disabled={zoomStep <= -1} onClick={() => stepZoom(-1)} aria-label={T.zoomOut} title={`${T.zoomOut} (−)`}>−</button>
        </div>
        <div className="zoom" role="group" aria-label={T.rotateView}>
          <button className="round small-round" onClick={() => stepRot(1)} aria-label={T.rotateRight} title={`${T.rotateRight} (E)`}>↻</button>
          <button className="round small-round" onClick={() => stepRot(-1)} aria-label={T.rotateLeft} title={`${T.rotateLeft} (Q)`}>↺</button>
        </div>
        <button
          className={`round ${self?.muted ? 'off' : ''}`}
          disabled={micState !== 'on'}
          onClick={toggleMute}
          title={`${self?.muted ? T.unmute : T.mute} (M)`}
          aria-label={`${self?.muted ? T.unmute : T.mute} (M)`}
        >
          {self?.muted || micState !== 'on' ? '🔇' : '🎤'}
        </button>
        <div className={`emotes ${emoteOpen ? 'open' : ''}`}>
          <button
            className="round only-small"
            onClick={() => setEmoteOpen((o) => !o)}
            aria-label={T.emotesMenu}
            aria-expanded={emoteOpen}
          >
            😀
          </button>
          <div className="emote-list">
            {EMOTES.map((e, i) => (
              <button
                key={e}
                className={`round ${e === 'raisehand' && self?.raised ? 'on' : ''}`}
                title={`${T.emotes[e]} (${i + 1})`}
                aria-label={`${T.emotes[e]} (${i + 1})`}
                onClick={() => { sendEmote(e); setEmoteOpen(false); }}
              >
                {EMOJI[e]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {deskEditing && <DeskEdit onClose={() => setDeskEditing(false)} />}
      <MusicBar />
      <NearTableButton />
      <GamePanel />
      {coarse && !deskEditing && !seated && <Joystick />}
      {selectedId && <div className="scrim" onClick={() => setStore({ selectedId: null })} />}

      {customizing && (
        <Modal onClose={() => setCustomizing(false)} titleId="customizer-heading">
          <div className="panel wide">
            <h1 id="customizer-heading">{T.customize}</h1>
            <Customizer initial={myAvatar} onDone={() => setCustomizing(false)} onCancel={() => setCustomizing(false)} />
          </div>
        </Modal>
      )}
      {changingPw && (
        <Modal onClose={() => setChangingPw(false)} ariaLabel={T.changePwTitle}>
          <ChangePassword forced={false} onDone={() => setChangingPw(false)} />
        </Modal>
      )}
    </>
  );
}

