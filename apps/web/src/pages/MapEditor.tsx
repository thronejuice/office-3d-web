import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { CATALOG, CATALOG_BY_ID, MAP_LIMITS, MUSIC_TRACKS, TILE, ZONE_KINDS, footprint, gameForTable, gameTables, inBounds, tableSeats, zoneKind, type Furniture, type MapData } from '@office3d/shared';
import { api, ApiError } from '../api';
import { T } from '../strings.th';
import { toast } from '../store';
import { navigate } from '../router';
import { MapView } from '../game/MapView';

type Tool = keyof typeof T.tools;
type FMode = 'place' | 'move' | 'delete';
interface User { id: string; displayName: string; disabled: boolean }
const ZONE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6'];
const TILE_FOR: Partial<Record<Tool, number>> = { floor: TILE.FLOOR, wall: TILE.WALL, door: TILE.DOOR, erase: TILE.VOID };
const TOOL_ICONS: Record<Tool, string> = { floor: '🧱', wall: '🧱', door: '🚪', erase: '🧹', furniture: '🪑', zone: '👥', desk: '💼', spawn: '🚩' };

interface View { top: boolean; zoom: number; target: THREE.Vector3 }

function Rig({ view }: { view: View }) {
  const { camera, gl } = useThree();
  useFrame(() => {
    const t = view.target;
    if (view.top) { camera.up.set(0, 0, -1); camera.position.set(t.x, 60, t.z); }
    else { camera.up.set(0, 1, 0); camera.position.set(t.x + 40, 40 * 1.0, t.z + 40); }
    camera.lookAt(t);
    if (camera.zoom !== view.zoom) { camera.zoom = view.zoom; camera.updateProjectionMatrix(); }
  });
  useEffect(() => {
    const el = gl.domElement;
    const wheel = (e: WheelEvent) => { e.preventDefault(); view.zoom = Math.max(8, Math.min(140, view.zoom * (e.deltaY < 0 ? 1.1 : 0.9))); };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [gl, view]);
  return null;
}

/** Tile under the pointer + paint/drag handling on a ground plane. */
function Ground({ map, onDown, onMove, onUp, view }: { map: MapData; onDown: (x: number, y: number, e: ThreeEvent<PointerEvent>) => void; onMove: (x: number, y: number) => void; onUp: () => void; view: View }) {
  const pan = useRef<{ x: number; y: number } | null>(null);
  const tile = (e: ThreeEvent<PointerEvent>) => [Math.floor(e.point.x), Math.floor(e.point.z)] as const;
  return (
    <mesh
      rotation-x={-Math.PI / 2} position={[map.width / 2, 0.02, map.height / 2]}
      onPointerDown={(e) => {
        if (e.button !== 0) { pan.current = { x: e.clientX, y: e.clientY }; return; }
        onDown(...tile(e), e);
      }}
      onPointerMove={(e) => {
        if (pan.current) {
          const k = 1 / view.zoom, dx = (e.clientX - pan.current.x) * k, dy = (e.clientY - pan.current.y) * k;
          pan.current = { x: e.clientX, y: e.clientY };
          if (view.top) { view.target.x -= dx; view.target.z -= dy; }
          else { view.target.x -= (dx + dy * 2) * 0.5 * Math.SQRT2 * 0.72; view.target.z -= (dy * 2 - dx) * 0.5 * Math.SQRT2 * 0.72; }
          return;
        }
        onMove(...tile(e));
      }}
      onPointerUp={() => { pan.current = null; onUp(); }}
      onPointerLeave={() => { pan.current = null; onUp(); }}
      onPointerCancel={() => { pan.current = null; onUp(); }}
    >
      <planeGeometry args={[map.width + 20, map.height + 20]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

function Marks({ map, hover, brush, tool, selDesk, selFurn }: { map: MapData; hover: { x: number; y: number } | null; brush: { type: string; rot: 0 | 1 | 2 | 3 } | null; tool: Tool; selDesk: string | null; selFurn: string | null }) {
  const ghost = useMemo(() => {
    if (!hover || tool !== 'furniture' || !brush) return [];
    return footprint({ id: 'g', type: brush.type, x: hover.x, y: hover.y, rot: brush.rot });
  }, [hover, brush, tool]);
  const sel = map.furniture.find((f) => f.id === selFurn);
  return (
    <>
      <gridHelper args={[Math.max(map.width, map.height), Math.max(map.width, map.height), '#8896ad', '#b6c0d0']} position={[map.width / 2, 0.03, map.height / 2]} scale={[map.width / Math.max(map.width, map.height), 1, map.height / Math.max(map.width, map.height)]} />
      {hover && inBounds(map, hover.x, hover.y) && tool !== 'furniture' && (
        <mesh position={[hover.x + 0.5, 0.05, hover.y + 0.5]}><boxGeometry args={[1, 0.05, 1]} /><meshBasicMaterial color="#3b6cf6" transparent opacity={0.5} /></mesh>
      )}
      {ghost.map((p, i) => (
        <mesh key={i} position={[p.x + 0.5, 0.06, p.y + 0.5]}><boxGeometry args={[1, 0.06, 1]} /><meshBasicMaterial color={inBounds(map, p.x, p.y) && map.tiles[p.y * map.width + p.x] === TILE.FLOOR ? '#22c55e' : '#ef4444'} transparent opacity={0.6} /></mesh>
      ))}
      {gameTables(map).flatMap((f) => tableSeats(map, f)).map((s, i) => (
        <mesh key={`seat${i}`} position={[s.x, 0.08, s.y]}><boxGeometry args={[0.5, 0.05, 0.5]} /><meshBasicMaterial color="#a855f7" transparent opacity={0.8} /></mesh>
      ))}
      {sel && footprint(sel).map((p, i) => <mesh key={i} position={[p.x + 0.5, 0.07, p.y + 0.5]}><boxGeometry args={[1, 0.06, 1]} /><meshBasicMaterial color="#f59e0b" transparent opacity={0.7} /></mesh>)}
      {map.desks.map((d) => (
        <mesh key={d.id} position={[d.x + 0.5, 0.12, d.y + 0.5]}>
          <cylinderGeometry args={[0.32, 0.32, 0.12, 16]} />
          <meshBasicMaterial color={d.id === selDesk ? '#3b6cf6' : d.userId ? '#22c55e' : '#facc15'} />
        </mesh>
      ))}
      <mesh position={[map.spawn.x + 0.5, 0.45, map.spawn.y + 0.5]}><coneGeometry args={[0.3, 0.8, 4]} /><meshBasicMaterial color="#ef4444" /></mesh>
    </>
  );
}

const resize = (m: MapData, w: number, h: number): MapData => {
  const tiles = new Array(w * h).fill(TILE.VOID);
  for (let y = 0; y < Math.min(h, m.height); y++) for (let x = 0; x < Math.min(w, m.width); x++) tiles[y * w + x] = m.tiles[y * m.width + x];
  const keep = (x: number, y: number) => x < w && y < h;
  return {
    ...m, width: w, height: h, tiles,
    furniture: m.furniture.filter((f) => footprint(f).every((p) => keep(p.x, p.y))),
    zones: m.zones.map((z) => ({ ...z, tiles: z.tiles.map((i) => [i % m.width, Math.floor(i / m.width)] as const).filter(([x, y]) => keep(x, y)).map(([x, y]) => y * w + x) })),
    desks: m.desks.filter((d) => keep(d.x, d.y)),
    spawn: keep(m.spawn.x, m.spawn.y) ? m.spawn : { x: 1, y: 1 },
  };
};

export default function MapEditor() {
  const [map, setMap] = useState<MapData | null>(null);
  const [version, setVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [tool, setTool] = useState<Tool>('floor');
  const [fmode, setFmode] = useState<FMode>('place');
  const [brush, setBrush] = useState<{ type: string; rot: 0 | 1 | 2 | 3 }>({ type: 'desk', rot: 0 });
  const [selFurn, setSelFurn] = useState<string | null>(null);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [selDesk, setSelDesk] = useState<string | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [versions, setVersions] = useState<{ version: number; note: string; createdAt: string }[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [top, setTop] = useState(false);
  const painting = useRef(false);
  const view = useMemo<View>(() => ({ top: false, zoom: 22, target: new THREE.Vector3(20, 0, 14) }), []);
  view.top = top;

  const loadVersions = useCallback(() => api('GET', '/api/admin/map/versions').then((r) => setVersions(r.versions)), []);
  useEffect(() => {
    api('GET', '/api/admin/map').then((r) => { setMap(r.draft); setVersion(r.version); setDirty(r.hasDraft); view.target.set(r.draft.width / 2, 0, r.draft.height / 2); });
    api('GET', '/api/admin/users').then((r) => setUsers(r.users.filter((u: User) => !u.disabled)));
    void loadVersions();
  }, [loadVersions, view]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = T.unsavedWarn; } };
    window.addEventListener('beforeunload', warn);
    const key = (e: KeyboardEvent) => {
      if (['INPUT', 'SELECT'].includes((e.target as HTMLElement).tagName)) return;
      if (e.code === 'KeyR') rotate();
      const d: Record<string, [number, number]> = { KeyW: [-1, -1], KeyS: [1, 1], KeyA: [-1, 1], KeyD: [1, -1], ArrowUp: [-1, -1], ArrowDown: [1, 1], ArrowLeft: [-1, 1], ArrowRight: [1, -1] };
      const v = d[e.code];
      if (v) { const s = 1.5; if (view.top) view.target.add(new THREE.Vector3(-v[0] * s * 0.5 + (v[1] === -v[0] ? 0 : 0), 0, 0)); view.target.x += v[0] * s * 0.7; view.target.z += v[1] * s * 0.7; }
    };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('beforeunload', warn); window.removeEventListener('keydown', key); };
  });

  const edit = (fn: (m: MapData) => MapData) => { setMap((m) => (m ? fn(m) : m)); setDirty(true); };
  const rotate = () => {
    if (selFurn) edit((m) => ({ ...m, furniture: m.furniture.map((f) => (f.id === selFurn ? { ...f, rot: (((f.rot + 1) % 4) as 0 | 1 | 2 | 3) } : f)) }));
    else setBrush((b) => ({ ...b, rot: (((b.rot + 1) % 4) as 0 | 1 | 2 | 3) }));
  };

  const furnAt = (m: MapData, x: number, y: number): Furniture | undefined => [...m.furniture].reverse().find((f) => footprint(f).some((p) => p.x === x && p.y === y));
  const idx = (m: MapData, x: number, y: number) => y * m.width + x;

  const apply = (x: number, y: number, first: boolean) => {
    if (!map || !inBounds(map, x, y)) return;
    const i = idx(map, x, y);
    if (tool in TILE_FOR) {
      const t = TILE_FOR[tool]!;
      if (map.tiles[i] === t) return;
      edit((m) => {
        const tiles = m.tiles.slice();
        tiles[i] = t;
        return {
          ...m, tiles,
          zones: t === TILE.VOID || t === TILE.WALL ? m.zones.map((z) => ({ ...z, tiles: z.tiles.filter((k) => k !== i) })) : m.zones,
          desks: t === TILE.VOID || t === TILE.WALL ? m.desks.filter((d) => !(d.x === x && d.y === y)) : m.desks,
        };
      });
    } else if (tool === 'zone' && zoneId) {
      edit((m) => ({ ...m, zones: m.zones.map((z) => (z.id === zoneId ? { ...z, tiles: z.tiles.includes(i) ? z.tiles : [...z.tiles, i] } : { ...z, tiles: z.tiles.filter((k) => k !== i) })) }));
    } else if (!first) return;
    else if (tool === 'furniture') {
      const hit = furnAt(map, x, y);
      if (fmode === 'delete') { if (hit) edit((m) => ({ ...m, furniture: m.furniture.filter((f) => f.id !== hit.id) })); }
      else if (fmode === 'move') {
        if (selFurn && (!hit || hit.id === selFurn)) { edit((m) => ({ ...m, furniture: m.furniture.map((f) => (f.id === selFurn ? { ...f, x, y } : f)) })); setSelFurn(null); }
        else setSelFurn(hit?.id ?? null);
      } else {
        if (hit && !selFurn) { setSelFurn(hit.id); return; }
        setSelFurn(null);
        const f: Furniture = { id: `f${Date.now().toString(36)}${Math.floor(Math.random() * 1e3)}`, type: brush.type, x, y, rot: brush.rot, ...(gameForTable(brush.type) ? { game: gameForTable(brush.type) } : {}) };
        if (footprint(f).every((p) => inBounds(map, p.x, p.y) && map.tiles[idx(map, p.x, p.y)] !== TILE.VOID)) edit((m) => ({ ...m, furniture: [...m.furniture, f] }));
      }
    } else if (tool === 'desk') {
      const hit = map.desks.find((d) => d.x === x && d.y === y);
      if (hit) setSelDesk(hit.id === selDesk ? null : hit.id);
      else if (map.tiles[i] === TILE.FLOOR || map.tiles[i] === TILE.DOOR) {
        const id = `d${Date.now().toString(36)}`;
        edit((m) => ({ ...m, desks: [...m.desks, { id, x, y, userId: null }] }));
        setSelDesk(id);
      }
    } else if (tool === 'spawn') edit((m) => ({ ...m, spawn: { x, y } }));
  };

  const run = async (fn: () => Promise<any>, ok?: (r: any) => string) => {
    setErrors([]);
    try { const r = await fn(); if (ok) toast(ok(r), { ms: 3000 }); return r; }
    catch (e) {
      if (e instanceof ApiError && e.body?.errors) setErrors(e.body.errors);
      else setErrors([e instanceof ApiError ? e.body?.message ?? e.code : T.errorGeneric]);
    }
  };
  const saveDraft = async () => { if (await run(() => api('PUT', '/api/admin/map/draft', map), () => T.draftSaved)) setDirty(false); };
  const publish = async () => {
    const r = await run(() => api('POST', '/api/admin/map/publish', map), (r) => T.published(r.version));
    if (r) { setDirty(false); setVersion(r.version); void loadVersions(); }
  };
  const rollback = async (v: number) => {
    const r = await run(() => api('POST', `/api/admin/map/rollback/${v}`), (r) => T.published(r.version));
    if (r) { const d = await api('GET', '/api/admin/map'); setMap(d.draft); setVersion(d.version); setDirty(false); void loadVersions(); }
  };

  if (!map) return <div className="center-page">{T.loading}</div>;
  const zone = map.zones.find((z) => z.id === zoneId);
  const desk = map.desks.find((d) => d.id === selDesk);
  const sel = map.furniture.find((f) => f.id === selFurn);

  return (
    <div className="editor">
      <aside>
        <div className="row"><button className="secondary" onClick={() => { if (!dirty || confirm(T.unsavedWarn)) navigate('/'); }}><span aria-hidden="true">←</span> {T.back}</button><h2 style={{ margin: 0 }}>{T.mapEditorTitle}</h2></div>
        <p className="muted small">v{version}{dirty ? ' • ' + T.unsavedWarn : ''}</p>
        <div className="tools">
          {(Object.keys(T.tools) as Tool[]).map((k) => <button key={k} className={tool === k ? 'on' : ''} onClick={() => { setTool(k); setSelFurn(null); }}><span aria-hidden="true">{TOOL_ICONS[k]}</span> {T.tools[k]}</button>)}
        </div>

        {tool === 'furniture' && (
          <>
            <div className="seg" style={{ marginTop: 8 }}>
              {(['place', 'move', 'delete'] as FMode[]).map((m) => (
                <button key={m} className={fmode === m ? 'on' : ''} onClick={() => { setFmode(m); setSelFurn(null); }}>
                  <span aria-hidden="true">{{ place: '📍', move: '↔️', delete: '🗑️' }[m]}</span> {{ place: T.furnPlace, move: T.furnMove, delete: T.delete }[m]}
                </button>
              ))}
              <button onClick={rotate}><span aria-hidden="true">🔄</span> {T.rotate} (R)</button>
            </div>
            <div className="catalog">
              {CATALOG.map((c) => <button key={c.id} className={brush.type === c.id ? 'on' : ''} onClick={() => { setBrush({ ...brush, type: c.id }); setSelFurn(null); setFmode('place'); }}><span aria-hidden="true">🪑</span> {c.name} <span className="muted small">{c.w}×{c.h}{c.blocks ? '' : ' •'}</span></button>)}
            </div>
            {sel && <p className="small">{CATALOG_BY_ID.get(sel.type)?.name} <button className="danger small" onClick={() => { edit((m) => ({ ...m, furniture: m.furniture.filter((f) => f.id !== sel.id) })); setSelFurn(null); }}><span aria-hidden="true">🗑️</span> {T.delete}</button></p>}
          </>
        )}

        {tool === 'zone' && (
          <div style={{ marginTop: 8 }}>
            {map.zones.map((z) => (
              <div key={z.id} className="row" style={{ marginBottom: 4 }}>
                <button className={`sw ${zoneId === z.id ? 'on' : ''}`} style={{ background: z.color }} onClick={() => setZoneId(z.id)} aria-label={z.name} />
                <input style={{ flex: 1 }} value={z.name} onChange={(e) => edit((m) => ({ ...m, zones: m.zones.map((q) => (q.id === z.id ? { ...q, name: e.target.value } : q)) }))} />
                <button className="ghost danger" aria-label={T.removeZone(z.name)} onClick={() => { edit((m) => ({ ...m, zones: m.zones.filter((q) => q.id !== z.id) })); if (zoneId === z.id) setZoneId(null); }}><span aria-hidden="true">🗑️</span></button>
              </div>
            ))}
            <button className="secondary" onClick={() => { const id = `z${Date.now().toString(36)}`; edit((m) => ({ ...m, zones: [...m.zones, { id, name: `${T.zoneName} ${m.zones.length + 1}`, color: ZONE_COLORS[m.zones.length % ZONE_COLORS.length], tiles: [] }] })); setZoneId(id); }}><span aria-hidden="true">➕</span> {T.newZone}</button>
            {zone && <p className="muted small">{T.zoneTiles(zone.tiles.length)}</p>}
            {zone && (
              <>
                <label>{T.zoneKind}
                  <select value={zoneKind(zone)} onChange={(e) => {
                    const kind = e.target.value as (typeof ZONE_KINDS)[number];
                    edit((m) => ({ ...m, zones: m.zones.map((q) => { if (q.id !== zone.id) return q; const { track, ...rest } = q; return kind === 'music' ? { ...rest, kind, track: track ?? 'rain' } : { ...rest, kind }; }) }));
                  }}>
                    {ZONE_KINDS.map((k) => <option key={k} value={k}>{T.zoneKinds[k]}</option>)}
                  </select>
                </label>
                {zoneKind(zone) === 'music' && (
                  <label>{T.musicTrack}
                    <select value={zone.track ?? 'rain'} onChange={(e) => edit((m) => ({ ...m, zones: m.zones.map((q) => (q.id === zone.id ? { ...q, track: e.target.value as (typeof MUSIC_TRACKS)[number] } : q)) }))}>
                      {MUSIC_TRACKS.map((t) => <option key={t} value={t}>{T.musicTracks[t]}</option>)}
                    </select>
                  </label>
                )}
              </>
            )}
          </div>
        )}

        {tool === 'desk' && (
          <div style={{ marginTop: 8 }}>
            <p className="muted small">{T.deskHint}</p>
            {desk ? (
              <>
                <label>{T.assignTo}
                  <select value={desk.userId ?? ''} onChange={(e) => { const uid = e.target.value || null; edit((m) => ({ ...m, desks: m.desks.map((d) => (d.id === desk.id ? { ...d, userId: uid } : uid && d.userId === uid ? { ...d, userId: null } : d)) })); }}>
                    <option value="">{T.nobody}</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}
                  </select>
                </label>
                <button className="danger small" onClick={() => { edit((m) => ({ ...m, desks: m.desks.filter((d) => d.id !== desk.id) })); setSelDesk(null); }}><span aria-hidden="true">🗑️</span> {T.delete}</button>
              </>
            ) : <p className="muted small">{T.deskCount(map.desks.length, map.desks.filter((d) => d.userId).length)}</p>}
          </div>
        )}

        <h3>{T.mapSize}</h3>
        <div className="row">
          {(['width', 'height'] as const).map((k) => (
            <input key={k} type="number" style={{ width: 80 }} min={MAP_LIMITS.minSize} max={MAP_LIMITS.maxSize} value={map[k]}
              onChange={(e) => { const v = Math.max(MAP_LIMITS.minSize, Math.min(MAP_LIMITS.maxSize, Number(e.target.value) || MAP_LIMITS.minSize)); edit((m) => resize(m, k === 'width' ? v : m.width, k === 'height' ? v : m.height)); }} />
          ))}
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="secondary" onClick={() => setTop((t) => !t)}><span aria-hidden="true">{top ? '🧊' : '📐'}</span> {top ? T.isoView : T.topView}</button>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="secondary" onClick={saveDraft}><span aria-hidden="true">💾</span> {T.saveDraft}</button>
          <button className="primary" onClick={publish}><span aria-hidden="true">🚀</span> {T.publish}</button>
        </div>
        {!!errors.length && <div className="error small" role="alert"><strong>{T.validationFailed}</strong><ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul></div>}
        <h3><button className="ghost disclosure" aria-expanded={showVersions} onClick={() => setShowVersions((s) => !s)}><span aria-hidden="true">📜</span> {T.versions} {showVersions ? '▾' : '▸'}</button></h3>
        {showVersions && (
          <ul className="people">
            {versions.map((v) => (
              <li key={v.version} style={{ cursor: 'default' }}>
                <div className="grow small">v{v.version} {v.version === version ? <b>({T.currentVersion})</b> : ''}<div className="muted">{new Date(v.createdAt).toLocaleString('th-TH')} {v.note}</div></div>
                {v.version !== version && <button className="secondary small" aria-label={T.rollbackTo(v.version)} title={T.rollbackTo(v.version)} onClick={() => confirm(`${T.rollback} (v${v.version})?`) && rollback(v.version)}><span aria-hidden="true">⏪</span></button>}
              </li>
            ))}
          </ul>
        )}
      </aside>
      <div className="view">
        <Canvas orthographic dpr={[1, 2]} camera={{ position: [40, 40, 40], zoom: 22, near: -100, far: 300 }} onContextMenu={(e) => e.preventDefault()}>
          <color attach="background" args={['#cfd8e6']} />
          <ambientLight intensity={1.15} /><directionalLight position={[8, 20, 6]} intensity={1.6} /><hemisphereLight args={['#fff', '#9aa6b5', 0.5]} />
          <Suspense fallback={null}>
            <MapView map={map} lowWalls />
          </Suspense>
          <Marks map={map} hover={hover} brush={brush} tool={tool} selDesk={selDesk} selFurn={selFurn} />
          <Ground map={map} view={view}
            onDown={(x, y) => { painting.current = true; apply(x, y, true); }}
            onMove={(x, y) => { setHover((h) => (h && h.x === x && h.y === y ? h : { x, y })); if (painting.current) apply(x, y, false); }}
            onUp={() => { painting.current = false; }} />
          <Rig view={view} />
        </Canvas>
      </div>
    </div>
  );
}
