import { MUSIC, zoneKind, type MusicTrack } from '@office3d/shared';
import { live } from './live';
import { useStore } from '../store';
import { voice } from './voice';

const KEY_VOL = 'office3d.musicVolume';
const KEY_OFF = 'office3d.musicOff';

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode: not remembered */ } };

interface Playing { track: MusicTrack; source: AudioBufferSourceNode; gain: GainNode }

/**
 * Nature sounds for music zones: they play only while you stand in one, fade in and out, and you control
 * volume and mute locally. Uses the same AudioContext as voice (created by the "enter office" tap).
 */
class Music {
  volume = Math.min(1, Math.max(0, Number(read(KEY_VOL) ?? MUSIC.defaultVolume)));
  off = read(KEY_OFF) === '1';
  private buffers = new Map<MusicTrack, AudioBuffer>();
  private loading = new Set<MusicTrack>();
  private cur: Playing | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  start() { if (!this.timer) this.timer = setInterval(() => this.tick(), 250); }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.release(this.cur, 0);
    this.cur = null;
    useStore.setState({ musicTrack: null });
  }

  /** Track of the music zone we stand in, if any. */
  private wanted(): MusicTrack | null {
    const m = live.map, id = live.self.zone;
    if (!m || !id) return null;
    const z = m.zones.find((q) => q.id === id);
    return z && zoneKind(z) === 'music' && z.track ? z.track : null;
  }

  private level() { return this.off ? 0 : this.volume; }

  private tick() {
    const want = this.wanted();
    if (useStore.getState().musicTrack !== want) useStore.setState({ musicTrack: want });
    if (want === (this.cur?.track ?? null)) return;
    const ctx = voice.ctx;
    if (!ctx) return;
    this.release(this.cur, MUSIC.fadeSeconds);
    this.cur = null;
    if (!want) return;
    const buf = this.buffers.get(want);
    if (!buf) return void this.load(want, ctx);
    const source = ctx.createBufferSource();
    source.buffer = buf;
    source.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(gain).connect(ctx.destination);
    source.start();
    gain.gain.setTargetAtTime(this.level(), ctx.currentTime, MUSIC.fadeSeconds / 3);
    this.cur = { track: want, source, gain };
  }

  private release(p: Playing | null, fade: number) {
    if (!p) return;
    const ctx = voice.ctx;
    if (ctx && fade > 0) p.gain.gain.setTargetAtTime(0, ctx.currentTime, fade / 3);
    setTimeout(() => { try { p.source.stop(); } catch { /* already stopped */ } p.gain.disconnect(); }, fade * 1000 + 300);
  }

  private async load(track: MusicTrack, ctx: AudioContext) {
    if (this.loading.has(track)) return;
    this.loading.add(track);
    try {
      const data = await (await fetch(`/audio/nature/${track}.mp3`)).arrayBuffer();
      const buf = await new Promise<AudioBuffer>((ok, bad) => ctx.decodeAudioData(data, ok, bad)); // callback form: older Safari has no promise version
      this.buffers.set(track, buf);
    } catch { /* missing file or decode error: the zone is just silent */ }
    this.loading.delete(track);
  }

  setVolume(v: number) {
    this.volume = Math.min(1, Math.max(0, v));
    write(KEY_VOL, String(this.volume));
    this.apply();
    useStore.setState({ musicVolume: this.volume });
  }
  setOff(off: boolean) {
    this.off = off;
    write(KEY_OFF, off ? '1' : '0');
    this.apply();
    useStore.setState({ musicOff: off });
  }
  private apply() {
    const ctx = voice.ctx;
    if (this.cur && ctx) this.cur.gain.gain.setTargetAtTime(this.level(), ctx.currentTime, 0.1);
  }
}

export const music = new Music();
