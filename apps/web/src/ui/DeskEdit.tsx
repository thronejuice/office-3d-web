import { useEffect, useMemo, useRef, useState } from 'react';
import { applyDeskEdit, CATALOG, deskArea, editableFurniture, footprint, type Furniture } from '@office3d/shared';
import { api, ApiError } from '../api';
import { live } from '../game/live';
import { deskEditClick } from '../game/deskEdit';
import { toast, useStore } from '../store';
import { T } from '../strings.th';

type Mode = 'place' | 'move' | 'delete';

/** Lets the owner of a desk place, move, rotate and delete furniture in the small area around it. */
export function DeskEdit({ onClose }: { onClose: () => void }) {
  const base = useRef(useStore.getState().map!).current;
  const selfId = useStore.getState().selfId!;
  const desk = base.desks.find((d) => d.userId === selfId)!;
  const area = useMemo(() => deskArea(base, desk), [base, desk]);
  const initial = useMemo(() => editableFurniture(base, desk), [base, desk]);
  const [items, setItems] = useState<Furniture[]>(initial);
  const [sel, setSel] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('place');
  const [type, setType] = useState('pottedPlant');
  const [rot, setRot] = useState<0 | 1 | 2 | 3>(0);
  const [err, setErr] = useState('');
  const saved = useRef(false);
  const ids = useMemo(() => new Set(initial.map((f) => f.id)), [initial]);
  const current = useRef({ items, sel, mode, type, rot });
  current.current = { items, sel, mode, type, rot };

  const preview = (list: Furniture[]) => {
    const m = { ...base, furniture: [...base.furniture.filter((f) => !ids.has(f.id)), ...list] };
    live.setMap(m);
    useStore.getState().set({ map: m });
  };
  const trySet = (list: Furniture[]) => {
    const r = applyDeskEdit(base, selfId, list);
    if ('error' in r) return setErr(r.error);
    setErr('');
    setItems(list);
    preview(list);
  };

  useEffect(() => {
    useStore.getState().set({ deskArea: [...area] });
    deskEditClick.handler = (x, y) => {
      const c = current.current;
      const hit = [...c.items].reverse().find((f) => footprint(f).some((p) => p.x === x && p.y === y));
      if (c.mode === 'delete') { if (hit) trySet(c.items.filter((f) => f.id !== hit.id)); return; }
      if (c.mode === 'move' && c.sel && !hit) {
        return trySet(c.items.map((f) => (f.id === c.sel ? { ...f, x, y } : f)));
      }
      if (hit) return setSel(hit.id === c.sel ? null : hit.id);
      if (c.mode === 'place') trySet([...c.items, { id: `u${Date.now().toString(36)}${Math.floor(Math.random() * 999)}`, type: c.type, x, y, rot: c.rot }]);
    };
    return () => {
      deskEditClick.handler = null;
      useStore.getState().set({ deskArea: null });
      if (!saved.current) { live.setMap(base); useStore.getState().set({ map: base }); } // cancelled: put the real map back
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rotate = () => {
    if (sel) trySet(items.map((f) => (f.id === sel ? { ...f, rot: (((f.rot + 1) % 4) as 0 | 1 | 2 | 3) } : f)));
    else setRot((r) => (((r + 1) % 4) as 0 | 1 | 2 | 3));
  };
  const save = async () => {
    try {
      await api('PUT', '/api/me/desk', { furniture: items });
      saved.current = true;
      toast(T.deskSaved, { ms: 2500 });
      onClose();
    } catch (e) { setErr(e instanceof ApiError ? e.body?.message ?? T.errorGeneric : T.errorGeneric); }
  };

  return (
    <div className="deskedit">
      <p className="muted small">{T.deskEditHint}</p>
      <div className="seg">
        {(['place', 'move', 'delete'] as Mode[]).map((m) => (
          <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
            <span aria-hidden="true">{{ place: '📍', move: '↔️', delete: '🗑️' }[m]}</span> {{ place: T.deskPlace, move: T.deskMove, delete: T.deskDelete }[m]}
          </button>
        ))}
        <button onClick={rotate}><span aria-hidden="true">🔄</span> {T.rotate}</button>
      </div>
      <div className="catalog-row">
        {CATALOG.map((c) => (
          <button key={c.id} className={type === c.id ? 'on' : ''} onClick={() => { setType(c.id); setMode('place'); setSel(null); }}><span aria-hidden="true">🪑</span> {c.name}</button>
        ))}
      </div>
      {err && <p className="error small">{err}</p>}
      <div className="row end">
        <button className="ghost" onClick={onClose}><span aria-hidden="true">✕</span> {T.cancel}</button>
        <button className="primary" onClick={save}><span aria-hidden="true">💾</span> {T.save}</button>
      </div>
    </div>
  );
}
