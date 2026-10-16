import { useStore } from '../store';
import { T } from '../strings.th';
import { music } from '../game/music';

const NOTE = 'M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z';
const NOTE_OFF = 'M2 2l20 20M9 9v9a3 3 0 1 1-3-3M9 5.5l12-2V13';

/** Shown only while you stand in a music zone: what is playing, mute, and your own volume. */
export function MusicBar() {
  const track = useStore((s) => s.musicTrack);
  const volume = useStore((s) => s.musicVolume);
  const off = useStore((s) => s.musicOff);
  if (!track) return null;
  return (
    <div className="musicbar" role="group" aria-label={T.musicVolume}>
      <button className="round small-round" onClick={() => music.setOff(!off)} aria-pressed={off} aria-label={off ? T.musicOn : T.musicOff} title={off ? T.musicOn : T.musicOff}>
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={off ? NOTE_OFF : NOTE} /></svg>
      </button>
      <div className="grow">
        <div className="small">{T.musicNow(T.musicTracks[track] ?? track)}</div>
        <input type="range" min={0} max={1} step={0.05} value={volume} disabled={off} aria-label={T.musicVolume} onChange={(e) => music.setVolume(Number(e.target.value))} />
      </div>
    </div>
  );
}
