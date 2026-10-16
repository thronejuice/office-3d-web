import { audibleGain, shouldConnect, type IceServer, type VoiceParty } from '@office3d/shared';
import { live } from './live';
import { useStore } from '../store';

type Signal = { type: 'offer' | 'answer'; sdp: string } | { type: 'candidate'; candidate: RTCIceCandidateInit } | { type: 'bye' };

interface Peer {
  id: string;
  pc: RTCPeerConnection;
  initiator: boolean;
  gain: GainNode;
  analyser?: AnalyserNode;
  source?: MediaStreamAudioSourceNode;
  el?: HTMLAudioElement;
  pending: RTCIceCandidateInit[];
  remoteSet: boolean;
  lastGain: number;
  speakBuf?: Uint8Array;
}

/** Audio-only WebRTC mesh. Who is connected and how loud is decided by the pure rules in @office3d/shared. */
class Voice {
  ctx: AudioContext | null = null;
  local: MediaStream | null = null;
  peers = new Map<string, Peer>();
  ice: IceServer[] = [];
  selfId = '';
  send: (to: string, data: Signal) => void = () => {};
  muted = false;
  sinkId = '';
  private timer?: ReturnType<typeof setInterval>;
  private localAnalyser?: AnalyserNode;
  private localBuf?: Uint8Array;

  /** Must run inside a user gesture (iOS Safari). */
  async init(): Promise<void> {
    const AC = window.AudioContext ?? (window as any).webkitAudioContext;
    this.ctx = new AC();
    await this.ctx.resume().catch(() => {});
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      useStore.getState().set({ micState: 'insecure' });
      return;
    }
    await this.openMic();
  }

  async openMic(deviceId?: string) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, ...(deviceId ? { deviceId: { exact: deviceId } } : {}) },
      });
      this.local?.getTracks().forEach((t) => t.stop());
      this.local = stream;
      stream.getAudioTracks().forEach((t) => (t.enabled = !this.muted));
      if (this.ctx) {
        this.localAnalyser = this.ctx.createAnalyser();
        this.localAnalyser.fftSize = 512;
        this.ctx.createMediaStreamSource(stream).connect(this.localAnalyser);
        this.localBuf = new Uint8Array(this.localAnalyser.fftSize);
      }
      const track = stream.getAudioTracks()[0];
      for (const p of this.peers.values()) p.pc.getSenders().find((s) => s.track === null || s.track?.kind === 'audio')?.replaceTrack(track);
      useStore.getState().set({ micState: 'on' });
    } catch (e: any) {
      const name = e?.name ?? '';
      useStore.getState().set({ micState: name === 'NotFoundError' || name === 'OverconstrainedError' ? 'none' : 'denied' });
    }
  }

  start(selfId: string, ice: IceServer[], send: Voice['send']) {
    this.selfId = selfId;
    this.ice = ice;
    this.send = send;
    clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), 100); // 10 Hz
  }

  stop() {
    clearInterval(this.timer);
    for (const id of [...this.peers.keys()]) this.close(id, false);
    this.local?.getTracks().forEach((t) => t.stop());
    this.local = null;
    void this.ctx?.close();
    this.ctx = null;
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.local?.getAudioTracks().forEach((t) => (t.enabled = !m));
  }

  async setSink(id: string) {
    this.sinkId = id;
    await (this.ctx as any)?.setSinkId?.(id).catch(() => {});
    for (const p of this.peers.values()) await (p.el as any)?.setSinkId?.(id).catch(() => {});
  }

  private party(id: string): VoiceParty | null {
    const st = useStore.getState();
    const person = st.people[id];
    if (!person) return null;
    if (id === this.selfId) return { x: live.self.x, y: live.self.y, zone: live.self.zone, status: person.status };
    const o = live.others.get(id);
    return o ? { x: o.x, y: o.y, zone: o.zone, status: person.status } : null;
  }

  tick() {
    const me = this.party(this.selfId);
    if (!me || !this.ctx) return;
    const st = useStore.getState();
    for (const id of Object.keys(st.people)) {
      if (id === this.selfId) continue;
      const other = this.party(id);
      if (!other) continue;
      const peer = this.peers.get(id);
      if (peer && ['failed', 'closed'].includes(peer.pc.connectionState)) { this.close(id, false); continue; }
      const want = shouldConnect(me, other, !!peer);
      if (want && !peer && this.selfId < id) void this.open(id, true);
      else if (!want && peer) this.close(id, true);
      const p = this.peers.get(id);
      if (p) {
        const g = audibleGain(me, other);
        if (Math.abs(g - p.lastGain) > 0.005 || (g === 0) !== (p.lastGain === 0)) { p.lastGain = g; p.gain.gain.setTargetAtTime(g, this.ctx.currentTime, 0.05); }
      }
    }
    for (const id of [...this.peers.keys()]) if (!st.people[id]) this.close(id, false);
    this.updateSpeaking();
  }

  private updateSpeaking() {
    const next: Record<string, boolean> = {};
    const level = (a?: AnalyserNode, buf?: Uint8Array) => {
      if (!a || !buf) return false;
      a.getByteTimeDomainData(buf as any);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
      return peak > 8;
    };
    if (!this.muted) next[this.selfId] = level(this.localAnalyser, this.localBuf);
    for (const [id, p] of this.peers) next[id] = p.lastGain > 0 && level(p.analyser, p.speakBuf);
    const cur = useStore.getState().speaking;
    const keys = new Set([...Object.keys(next), ...Object.keys(cur)]);
    for (const k of keys) if (!!next[k] !== !!cur[k]) return void useStore.getState().set({ speaking: next });
  }

  private makePeer(id: string, initiator: boolean): Peer {
    const ctx = this.ctx!;
    const pc = new RTCPeerConnection({ iceServers: this.ice });
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);
    const peer: Peer = { id, pc, initiator, gain, pending: [], remoteSet: false, lastGain: 0 };
    // Always negotiate a sendrecv audio line, even without a mic, so a mic granted later can use replaceTrack.
    const tr = pc.addTransceiver('audio', { direction: 'sendrecv' });
    const track = this.local?.getAudioTracks()[0];
    if (track) void tr.sender.replaceTrack(track);
    pc.onicecandidate = (e) => e.candidate && this.send(id, { type: 'candidate', candidate: e.candidate.toJSON() });
    pc.ontrack = (e) => {
      const stream = e.streams[0] ?? new MediaStream([e.track]);
      // Chromium only feeds Web Audio from a remote stream if it is also attached to a media element.
      const el = new Audio();
      el.srcObject = stream;
      el.muted = true;
      void el.play().catch(() => {});
      peer.el = el;
      peer.source?.disconnect();
      peer.source = ctx.createMediaStreamSource(stream);
      peer.source.connect(gain);
      peer.analyser = ctx.createAnalyser();
      peer.analyser.fftSize = 512;
      peer.speakBuf = new Uint8Array(peer.analyser.fftSize);
      peer.source.connect(peer.analyser);
    };
    this.peers.set(id, peer);
    return peer;
  }

  private async open(id: string, initiator: boolean) {
    const peer = this.makePeer(id, initiator);
    const offer = await peer.pc.createOffer();
    await peer.pc.setLocalDescription(offer);
    this.send(id, { type: 'offer', sdp: offer.sdp! });
  }

  close(id: string, notify: boolean) {
    const p = this.peers.get(id);
    if (!p) return;
    this.peers.delete(id);
    if (notify) this.send(id, { type: 'bye' });
    p.pc.onicecandidate = p.pc.ontrack = null;
    p.pc.close();
    p.source?.disconnect();
    p.gain.disconnect();
    if (p.el) { p.el.srcObject = null; }
  }

  async handleSignal(from: string, data: Signal) {
    if (!this.ctx) return;
    if (data.type === 'bye') return this.close(from, false);
    if (data.type === 'offer') {
      this.close(from, false);
      const peer = this.makePeer(from, false);
      await peer.pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
      peer.remoteSet = true;
      for (const c of peer.pending.splice(0)) await peer.pc.addIceCandidate(c).catch(() => {});
      const answer = await peer.pc.createAnswer();
      await peer.pc.setLocalDescription(answer);
      this.send(from, { type: 'answer', sdp: answer.sdp! });
      return;
    }
    const peer = this.peers.get(from);
    if (!peer) return;
    if (data.type === 'answer') {
      await peer.pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
      peer.remoteSet = true;
      for (const c of peer.pending.splice(0)) await peer.pc.addIceCandidate(c).catch(() => {});
    } else if (data.type === 'candidate') {
      if (peer.remoteSet) await peer.pc.addIceCandidate(data.candidate).catch(() => {});
      else peer.pending.push(data.candidate);
    }
  }

  /** For the E2E tests. */
  debug() {
    return [...this.peers.values()].map((p) => ({ id: p.id, state: p.pc.connectionState, gain: p.lastGain }));
  }

  knockSound() {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const [i, f] of [220, 180].entries()) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f; o.type = 'triangle';
      const t = ctx.currentTime + i * 0.16;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.connect(g).connect(ctx.destination);
      o.start(t); o.stop(t + 0.15);
    }
  }
}

export const voice = new Voice();
