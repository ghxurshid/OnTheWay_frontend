/* ════════════════════════════════════════════════════════════════
   CALL CLIENT — /hubs/call (singleton) + WebRTC audio.
   ────────────────────────────────────────────────────────────────
   The hub ONLY relays signaling (call lifecycle + SDP/ICE). Audio media
   flows peer-to-peer over WebRTC and never touches the backend. This client
   wires the two together behind a small high-level API the CallScreen uses.
   ════════════════════════════════════════════════════════════════ */

import type { HubConnection } from '@microsoft/signalr';
import { createHubConnection, startConnection } from './hubConnection';
import { callApi } from '@/api/callApi';

const FALLBACK_ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

const CALLER_RING_TIMEOUT_MS = 40_000;
const CALLEE_RING_TIMEOUT_MS = 50_000;

interface CallState { callId: string; peerId: string; role: 'caller' | 'callee'; accepted: boolean }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (payload?: any) => void;

let connection: HubConnection | null = null;
const listeners = new Map<string, Set<Handler>>();

// Active call state (one 1:1 call at a time).
let call: CallState | null = null;
let pc: RTCPeerConnection | null = null;
let localStream: MediaStream | null = null;
let micPromise: Promise<MediaStream> | null = null; // single-flight getUserMedia
let remoteAudioEl: HTMLAudioElement | null = null;
let ringTimer: ReturnType<typeof setTimeout> | null = null;
const pendingIce: RTCIceCandidateInit[] = []; // ICE that arrived before remote desc

function emit(event: string, payload?: unknown) {
  listeners.get(event)?.forEach((fn) => {
    try { fn(payload); } catch (e) { console.error(`[call] ${event} handler`, e); }
  });
}

function clearRingTimer() {
  if (ringTimer) { clearTimeout(ringTimer); ringTimer = null; }
}

/** Ring timeout: notify the server, tear down locally and surface 'ended'. */
function armRingTimer(ms: number) {
  clearRingTimer();
  ringTimer = setTimeout(() => {
    if (!call || call.accepted) return;
    const callId = call.callId;
    connection?.invoke('Hangup', callId).catch(() => {});
    teardown();
    emit('ended', { callId, reason: 'timeout' });
  }, ms);
}

function ensureConnection(): HubConnection {
  if (connection) return connection;
  const conn = createHubConnection('/hubs/call');
  connection = conn;

  conn.on('IncomingCall', (invite: { callId: string; fromUserId: string }) => {
    if (call) { conn.invoke('RejectCall', invite.callId).catch(() => {}); return; }
    call = { callId: invite.callId, peerId: invite.fromUserId, role: 'callee', accepted: false };
    armRingTimer(CALLEE_RING_TIMEOUT_MS);
    getIceServers().catch(() => {}); // warm the TURN credentials while ringing
    emit('incoming', invite);
  });

  conn.on('CallAccepted', async (callId: string, byUserId: string) => {
    if (!call || call.callId !== callId) return;
    call.accepted = true;
    clearRingTimer();
    emit('accepted', { callId, byUserId });
    if (call.role === 'caller') {
      try { await makeOffer(); } catch (e) { failCall('media-error', e); }
    }
  });

  conn.on('CallRejected', (callId: string) => {
    if (!call || call.callId !== callId) return;
    teardown();
    emit('rejected', { callId });
  });

  conn.on('CallEnded', (callId: string) => {
    if (!call || call.callId !== callId) return;
    teardown();
    emit('ended', { callId, reason: 'remote' });
  });

  conn.on('ReceiveOffer', async (payload: { callId: string; sdp: string }) => {
    const c = call;
    if (!c || c.callId !== payload.callId) return;
    try {
      const peer = await ensurePeer();
      await peer.setRemoteDescription({ type: 'offer', sdp: payload.sdp });
      await drainIce(peer);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await conn.invoke('SendAnswer', c.peerId, c.callId, answer.sdp);
    } catch (e) {
      failCall('media-error', e);
    }
  });

  conn.on('ReceiveAnswer', async (payload: { callId: string; sdp: string }) => {
    const peer = pc;
    if (!call || call.callId !== payload.callId || !peer) return;
    try {
      await peer.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
      await drainIce(peer);
    } catch (e) {
      failCall('media-error', e);
    }
  });

  conn.on('ReceiveIceCandidate', async (payload: { callId: string; candidate: string; sdpMid: string; sdpMLineIndex: number }) => {
    if (!call || call.callId !== payload.callId) return;
    const candidate: RTCIceCandidateInit = {
      candidate: payload.candidate,
      sdpMid: payload.sdpMid,
      sdpMLineIndex: payload.sdpMLineIndex,
    };
    if (pc && pc.remoteDescription) await pc.addIceCandidate(candidate).catch(() => {});
    else pendingIce.push(candidate);
  });

  conn.onclose(() => {
    if (!call) return;
    const callId = call.callId;
    teardown();
    emit('ended', { callId, reason: 'connection' });
  });

  return conn;
}

/** Abort the active call after an unrecoverable local error. */
function failCall(reason: string, err?: unknown) {
  if (err && import.meta.env?.DEV) console.warn(`[call] ${reason}:`, (err as Error)?.message || err);
  if (!call) return;
  const callId = call.callId;
  connection?.invoke('Hangup', callId).catch(() => {});
  teardown();
  emit('ended', { callId, reason });
}

// --- WebRTC plumbing --------------------------------------------------

let iceCache: { servers: RTCIceServer[]; expiresAt: number } | null = null;

async function getIceServers(): Promise<RTCIceServer[]> {
  if (iceCache && Date.now() < iceCache.expiresAt) return iceCache.servers;
  try {
    const dto = await callApi.iceServers();
    const servers: RTCIceServer[] = (dto?.iceServers || [])
      .filter((s: { urls?: string[] }) => s && s.urls && s.urls.length)
      .map((s: { urls: string[]; username?: string; credential?: string }) => (s.username && s.credential
        ? { urls: s.urls, username: s.username, credential: s.credential }
        : { urls: s.urls }));
    if (servers.length) {
      const ttlMs = Math.max(60, dto.ttlSeconds || 3600) * 1000 * 0.8;
      iceCache = { servers, expiresAt: Date.now() + ttlMs };
      return servers;
    }
  } catch { /* backend unreachable — degrade to STUN-only */ }
  return FALLBACK_ICE_SERVERS;
}

function getMic(): Promise<MediaStream> {
  if (localStream) return Promise.resolve(localStream);
  if (!micPromise) {
    micPromise = navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      .then((stream) => { localStream = stream; return stream; })
      .finally(() => { micPromise = null; });
  }
  return micPromise;
}

let peerPromise: Promise<RTCPeerConnection> | null = null; // single-flight

function ensurePeer(): Promise<RTCPeerConnection> {
  if (pc) return Promise.resolve(pc);
  if (!peerPromise) peerPromise = createPeer().finally(() => { peerPromise = null; });
  return peerPromise;
}

async function createPeer(): Promise<RTCPeerConnection> {
  const iceServers = await getIceServers();
  if (pc) return pc; // created while we awaited
  const peer = new RTCPeerConnection({ iceServers });
  pc = peer;

  const stream = await getMic();
  stream.getTracks().forEach((track) => peer.addTrack(track, stream));

  peer.onicecandidate = (e) => {
    if (e.candidate && call) {
      connection?.invoke('SendIceCandidate', call.peerId, call.callId,
        e.candidate.candidate, e.candidate.sdpMid, e.candidate.sdpMLineIndex).catch(() => {});
    }
  };

  peer.ontrack = (e) => {
    const [remote] = e.streams;
    attachRemoteAudio(remote);
    emit('remoteStream', remote);
  };

  peer.onconnectionstatechange = () => {
    if (pc && pc.connectionState === 'failed') failCall('connection');
  };

  return peer;
}

async function makeOffer() {
  const peer = await ensurePeer();
  const c = call;
  if (!c) return;
  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  await connection?.invoke('SendOffer', c.peerId, c.callId, offer.sdp);
}

async function drainIce(peer: RTCPeerConnection) {
  while (pendingIce.length) {
    const cand = pendingIce.shift();
    if (cand) await peer.addIceCandidate(cand).catch(() => {});
  }
}

function attachRemoteAudio(stream: MediaStream) {
  if (!remoteAudioEl) {
    remoteAudioEl = document.createElement('audio');
    remoteAudioEl.autoplay = true;
    remoteAudioEl.setAttribute('playsinline', '');
    remoteAudioEl.style.display = 'none';
    document.body.appendChild(remoteAudioEl);
  }
  remoteAudioEl.srcObject = stream;
  remoteAudioEl.play?.().catch(() => {});
}

function teardown() {
  clearRingTimer();
  pendingIce.length = 0;
  if (pc) { try { pc.close(); } catch { /* ignore */ } pc = null; }
  if (localStream) { localStream.getTracks().forEach((t) => t.stop()); localStream = null; }
  if (remoteAudioEl) { remoteAudioEl.srcObject = null; }
  call = null;
}

// --- public API -------------------------------------------------------

export const callClient = {
  on(event: string, handler: Handler) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event)!.add(handler);
    return () => { listeners.get(event)?.delete(handler); };
  },

  async connect() {
    await startConnection(ensureConnection());
  },

  async disconnect() {
    teardown();
    if (connection) { try { await connection.stop(); } catch { /* ignore */ } }
    connection = null;
  },

  isConnected(): boolean {
    return connection?.state === 'Connected';
  },

  /** Caller: ring `toUserId`. Audio is negotiated once they accept. */
  async startCall(toUserId: string, callType = 'audio'): Promise<string> {
    const conn = connection;
    if (!conn || conn.state !== 'Connected') throw new Error('Call hub not connected');
    getIceServers().catch(() => {}); // warm the TURN credentials while ringing
    await getMic(); // prompt for the mic up front so accept is instant
    const callId: string = await conn.invoke('InitiateCall', toUserId, callType);
    call = { callId, peerId: toUserId, role: 'caller', accepted: false };
    armRingTimer(CALLER_RING_TIMEOUT_MS);
    return callId;
  },

  /** Callee: accept the current incoming call. */
  async acceptCall() {
    const c = call;
    if (!c || c.role !== 'callee') return;
    clearRingTimer();
    try {
      await connection?.invoke('AcceptCall', c.callId);
      c.accepted = true;
    } catch (e) {
      teardown();
      throw e;
    }
    getMic().catch((e) => failCall('mic-denied', e));
  },

  /** Callee: reject the current incoming call. */
  async rejectCall() {
    if (!call) return;
    try { await connection?.invoke('RejectCall', call.callId); } catch { /* ignore */ }
    teardown();
  },

  /** Either side: hang up an in-progress (or ringing) call. */
  async hangup() {
    if (!call) return;
    try { await connection?.invoke('Hangup', call.callId); } catch { /* ignore */ }
    teardown();
  },

  /** Mute/unmute the local mic without renegotiating. */
  setMuted(muted: boolean) {
    localStream?.getAudioTracks().forEach((t) => { t.enabled = !muted; });
  },

  currentCall(): CallState | null {
    return call;
  },
};
