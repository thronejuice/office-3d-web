import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  ACCESSORY_STYLES,
  BOTTOM_STYLES,
  CLOTH_COLORS,
  DEFAULT_AVATAR,
  EYE_STYLES,
  HAIR_COLORS,
  HAIR_STYLES,
  MOUTH_STYLES,
  SKIN_TONES,
  TOP_STYLES,
  type AvatarConfig,
} from '@office3d/shared';
import { T } from '../strings.th';
import { buildRig, disposeRig } from '../game/Avatar';
import { api } from '../api';
import { useStore, toast } from '../store';

const TABS = ['hair', 'face', 'outfit', 'accessory'] as const;
type Tab = (typeof TABS)[number];
const TAB_ICON: Record<Tab, string> = { hair: '💇', face: '🙂', outfit: '👕', accessory: '🕶️' };

function Preview({ cfg }: { cfg: AvatarConfig }) {
  const rig = useMemo(() => buildRig(cfg), [cfg]);
  useEffect(() => () => disposeRig(rig), [rig]);
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => g.current && (g.current.rotation.y += dt * 0.8));
  return (
    <group ref={g} position={[0, -0.65, 0]}>
      <primitive object={rig.root} />
    </group>
  );
}

const Swatches = ({
  colors,
  value,
  onPick,
}: {
  colors: readonly string[];
  value: string;
  onPick: (c: string) => void;
}) => (
  <div className="swatches">
    {colors.map((c) => (
      <button
        key={c}
        className={`sw ${c.toLowerCase() === value.toLowerCase() ? 'on' : ''}`}
        aria-pressed={c.toLowerCase() === value.toLowerCase()}
        style={{ background: c }}
        onClick={() => onPick(c)}
        aria-label={c}
      />
    ))}
  </div>
);

const Options = ({
  items,
  value,
  labels,
  onPick,
}: {
  items: readonly string[];
  value: string;
  labels: Record<string, string>;
  onPick: (v: string) => void;
}) => (
  <div className="chips">
    {items.map((i) => (
      <button
        key={i}
        className={`chip ${i === value ? 'on' : ''}`}
        aria-pressed={i === value}
        onClick={() => onPick(i)}
      >
        {labels[i] ?? i}
      </button>
    ))}
  </div>
);

export function Customizer({
  initial,
  onDone,
  onCancel,
}: {
  initial: AvatarConfig | null;
  onDone: (a: AvatarConfig) => void;
  onCancel?: () => void;
}) {
  const [cfg, setCfg] = useState<AvatarConfig>(initial ?? DEFAULT_AVATAR);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>('hair');
  // arrow keys move between tabs (roving tabindex), Home/End jump to the first/last
  const onTabKey = (e: React.KeyboardEvent) => {
    const i = TABS.indexOf(tab);
    const next = e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i + TABS.length - 1) % TABS.length : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    setTab(TABS[next]);
    document.getElementById(`tab-${TABS[next]}`)?.focus();
  };
  const up = <K extends keyof AvatarConfig>(k: K, v: AvatarConfig[K]) =>
    setCfg((c) => ({ ...c, [k]: v }));

  const save = async () => {
    setBusy(true);
    try {
      await api('PUT', '/api/me/avatar', cfg);
      useStore.getState().set({ myAvatar: cfg });
      toast(T.avatarSaved, { ms: 2000 });
      onDone(cfg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="customizer">
      <div className="preview">
        <Canvas camera={{ position: [0, 0.3, 2.6], fov: 35 }} dpr={[1, 2]}>
          <ambientLight intensity={1.3} />
          <directionalLight position={[3, 5, 4]} intensity={1.8} />
          <Preview cfg={cfg} />
        </Canvas>
      </div>
      <div className="options">
        <div className="tabs" role="tablist" aria-label={T.customize} onKeyDown={onTabKey}>
          {TABS.map((t) => (
            <button
              key={t}
              id={`tab-${t}`}
              role="tab"
              className="tab"
              aria-selected={tab === t}
              aria-controls="tabpanel"
              tabIndex={tab === t ? 0 : -1}
              onClick={() => setTab(t)}
            >
              <span aria-hidden="true">{TAB_ICON[t]}</span> {T.tabs[t]}
            </button>
          ))}
        </div>

        <div className="tabpanel" id="tabpanel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
          {tab === 'hair' && (
            <>
              <h3>{T.skin}</h3>
              <Swatches colors={SKIN_TONES} value={cfg.skin} onPick={(c) => up('skin', c)} />

              <h3>{T.hairStyle}</h3>
              <Options items={HAIR_STYLES} value={cfg.hairStyle} labels={T.hair} onPick={(v) => up('hairStyle', v as any)} />

              <h3>{T.hairColor}</h3>
              <Swatches colors={HAIR_COLORS} value={cfg.hairColor} onPick={(c) => up('hairColor', c)} />
            </>
          )}

          {tab === 'face' && (
            <>
              <h3>{T.eyes}</h3>
              <Options items={EYE_STYLES} value={cfg.eyes} labels={T.eyeStyles} onPick={(v) => up('eyes', v as any)} />

              <h3>{T.mouth}</h3>
              <Options items={MOUTH_STYLES} value={cfg.mouth} labels={T.mouthStyles} onPick={(v) => up('mouth', v as any)} />

              <h3>{T.blush}</h3>
              <div className="chips">
                <button className={`chip ${cfg.blush ? 'on' : ''}`} aria-pressed={cfg.blush} onClick={() => up('blush', true)}>
                  {T.on}
                </button>
                <button className={`chip ${!cfg.blush ? 'on' : ''}`} aria-pressed={!cfg.blush} onClick={() => up('blush', false)}>
                  {T.off}
                </button>
              </div>
            </>
          )}

          {tab === 'outfit' && (
            <>
              <h3>{T.top}</h3>
              <Options items={TOP_STYLES} value={cfg.top} labels={T.tops} onPick={(v) => up('top', v as any)} />

              <h3>{T.topColor}</h3>
              <Swatches colors={CLOTH_COLORS} value={cfg.topColor} onPick={(c) => up('topColor', c)} />

              <h3>{T.bottom}</h3>
              <Options items={BOTTOM_STYLES} value={cfg.bottom} labels={T.bottoms} onPick={(v) => up('bottom', v as any)} />

              <h3>{T.bottomColor}</h3>
              <Swatches colors={CLOTH_COLORS} value={cfg.bottomColor} onPick={(c) => up('bottomColor', c)} />
            </>
          )}

          {tab === 'accessory' && (
            <>
              <h3>{T.accessory}</h3>
              <Options items={ACCESSORY_STYLES} value={cfg.accessory} labels={T.accessories} onPick={(v) => up('accessory', v as any)} />

              {cfg.accessory !== 'none' && (
                <>
                  <h3>{T.accessoryColor}</h3>
                  <Swatches colors={CLOTH_COLORS} value={cfg.accessoryColor} onPick={(c) => up('accessoryColor', c)} />
                </>
              )}
            </>
          )}
        </div>

        <div className="row end">
          {onCancel && (
            <button className="danger solid" onClick={onCancel}>
              <span aria-hidden="true">✕</span> {T.cancel}
            </button>
          )}
          <button className="primary" disabled={busy} onClick={save}>
            <span aria-hidden="true">💾</span> {T.save}
          </button>
        </div>
      </div>
    </div>
  );
}
