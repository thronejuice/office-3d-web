import { AUDIO, type Status } from './constants';

export interface VoiceParty {
  x: number;
  y: number;
  /** id of the meeting zone the user stands in, or null on the open floor */
  zone: string | null;
  status: Status;
}

export const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

/** Linear falloff: 1 up to fullVolumeDistance, 0 from silentDistance. */
export function gainForDistance(d: number): number {
  const { fullVolumeDistance: full, silentDistance: silent } = AUDIO;
  if (d <= full) return 1;
  if (d >= silent) return 0;
  return (silent - d) / (silent - full);
}

/** Audible volume of `b` for `a` (symmetric). Encodes zone and DND rules. */
export function audibleGain(a: VoiceParty, b: VoiceParty): number {
  if (a.zone || b.zone) return a.zone && a.zone === b.zone ? 1 : 0;
  if (a.status === 'dnd' || b.status === 'dnd') return 0;
  return gainForDistance(distance(a, b));
}

/** Should a peer connection exist? Same zone: always. Otherwise distance with hysteresis. */
export function shouldConnect(a: VoiceParty, b: VoiceParty, connected: boolean): boolean {
  if (a.zone || b.zone) return !!a.zone && a.zone === b.zone;
  if (a.status === 'dnd' || b.status === 'dnd') return false;
  const d = distance(a, b);
  return connected ? d <= AUDIO.disconnectDistance : d <= AUDIO.connectDistance;
}
