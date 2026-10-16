import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { Emote } from '@office3d/shared';
import { useStore } from '../store';
import { T } from '../strings.th';
import { live } from '../game/live';
import { cam } from '../game/camera';
import { AVATAR_HEIGHT } from '../game/Avatar';
import { sendKnock, walkToPerson } from '../game/net';
import { hoverAvatar, keepHover } from '../game/hover';

const EMOJI: Record<Emote, string> = { wave: '👋', clap: '👏', thumbsup: '👍', raisehand: '✋' };

/** Name tags, emote bubbles and the hover card, pinned to avatars by projecting their world position every frame. */
export function Overlay() {
  const people = useStore((s) => s.people);
  const emotes = useStore((s) => s.emotes);
  const selfId = useStore((s) => s.selfId);
  const selectedId = useStore((s) => s.selectedId);
  const hoverId = useStore((s) => s.hoverId);
  const map = useStore((s) => s.map);
  const els = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    const v = new THREE.Vector3();
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!cam.camera) return;
      for (const [id, el] of els.current) {
        const L = id === useStore.getState().selfId ? live.self : live.others.get(id);
        if (!L) { el.style.display = 'none'; continue; }
        v.set(L.x, AVATAR_HEIGHT + 0.15, L.y).project(cam.camera);
        el.style.display = '';
        el.style.transform = `translate(${(v.x * 0.5 + 0.5) * cam.w}px, ${(-v.y * 0.5 + 0.5) * cam.h}px) translate(-50%, -100%)`;
        el.style.zIndex = String(Math.round((1 - v.z) * 1000));
      }
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="overlay">
      {Object.entries(people).map(([id, p]) => {
        const e = emotes[id];
        const card = id !== selfId && (selectedId === id || hoverId === id);
        return (
          <div key={id} className="anchor" ref={(el) => { el ? els.current.set(id, el) : els.current.delete(id); }}>
            {card && (
              <div className="card" onPointerEnter={() => keepHover(id)} onPointerLeave={() => hoverAvatar(id, false)}>
                <strong>{p.user.displayName}</strong>
                <div className="muted">{[p.user.department, p.user.jobTitle].filter(Boolean).join(' · ') || ' '}</div>
                <div><span className={`dot s-${p.status}`} role="img" title={T.status[p.status]} aria-label={T.status[p.status]} /> {T.status[p.status]}{p.zone ? ` · ${T.inZone(map?.zones.find((z) => z.id === p.zone)?.name ?? '')}` : ''}</div>
                <div className="row">
                  <button className="primary" onClick={() => { walkToPerson(id); useStore.getState().set({ selectedId: null, hoverId: null }); }}><span aria-hidden="true">🚶</span> {T.walkTo}</button>
                  <button className="secondary" onClick={() => sendKnock(id)}><span aria-hidden="true">✊</span> {T.knock}</button>
                </div>
              </div>
            )}
            {(e || p.raised) && <div className="bubble">{e ? EMOJI[e.emote] : EMOJI.raisehand}</div>}
            <div className="tag-row">
              <span className={`dot s-${p.status}`} role="img" title={T.status[p.status]} aria-label={T.status[p.status]} />
              <span className="tag-name">{p.user.displayName}</span>
              {p.muted && <span role="img" title={T.muted} aria-label={T.muted}>🔇</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
