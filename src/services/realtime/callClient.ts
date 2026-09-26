/* ════════════════════════════════════════════════════════════════
   CALL CLIENT — /hubs/call (singleton) + WebRTC audio.
   ────────────────────────────────────────────────────────────────
   The hub ONLY relays signaling (call lifecycle + SDP/ICE). Audio media
   flows peer-to-peer over WebRTC and never touches the backend. This client
   wires the two together behind a small high-level API the CallScreen uses.

   A dropped signaling socket does NOT end the call — the audio is P2P and may
   be fine. When the socket is back the call is reconciled with the server's
   persisted session (an accept or hang-up sent meanwhile never arrived), and
   a broken media path is repaired with an ICE restart (mediaRecovery).
   ════════════════════════════════════════════════════════════════ */

import type { HubConnection } from '@microsoft/signalr';
import { createEmitter, createHubClient } from './hubConnection';
import { createMediaRecovery } from './mediaRecovery';
import { callApi } from '@/api/callApi';
import { appError } from '@/utils/errors';

const FALLBACK_ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

const CALLER_RING_TIMEOUT_MS = 40_000;
const CALLEE_RING_TIMEOUT_MS = 50_000;
/** After answering, the caller's offer must arrive within this — else their app lost the call. */
const OFFER_TIMEOUT_MS = 20_000;

interface CallState { callId: string; peerId: string; role: 'caller' | 'callee'; accepted: boolean }

const { on, emit } = createEmitter('call');
const hub = createHubClient('/hubs/call', wireHandlers, { onConnected: reconcile });

// Active call state (one 1:1 call at a time).
let call: CallState | null = null;
let pc: RTCPeerConnection | null = null;
let recovery: ReturnType<typeof createMediaRecovery> | null = null;
let localStream: MediaStream | null = null;
let micPromise: Promise<MediaStream> | null = null; // single-flight getUserMedia
let remoteAudioEl: HTMLAudioElement | null = null;
let ringTimer: ReturnType<typeof setTimeout> | null = null;
const pendingIce: RTCIceCandidateInit[] = []; // ICE that arrived before remote desc

// A hang-up / decline made while signaling is down would never reach the other
// side (it would keep ringing) nor close the server's session: it is sent as soon
// as the socket is back (see reconcile).
const unsentEnds = new Map<string, 'Hangup' | 'RejectCall'>();

/** Tell the server this call is over from our side — now, or on reconnect. */
async function sendEnd(method: 'Hangup' | 'RejectCall', callId: string): Promise<void> {
  const conn = hub.connected();
  if (!conn) { unsentEnds.set(callId, method); return; }
  try {
    await conn.invoke(method, callId);
  } catch {
    if (!hub.isConnected()) unsentEnds.set(callId, method); // lost mid-call; a refusal is final
  }
}

/** Fire-and-forget: tell the server the call is over. */
const hangupOnServer = (callId: string): void => { sendEnd('Hangup', callId); };

/** True when a server event belongs to the call in progress. */
const isCurrent = (callId: string): boolean => !!call && call.callId === callId;

function clearRingTimer() {
  if (ringTimer) { clearTimeout(ringTimer); ringTimer = null; }
}

/** Ring timeout: notify the server, tear down locally and surface 'ended'. */
function armRingTimer(ms: number) {
  clearRingTimer();
  ringTimer = setTimeout(() => {
    if (!call || call.accepted) return;
    endLocally(call.callId, 'timeout', true);
  }, ms);
}

/** Tear the call down and surface 'ended' with a reason. */
function endLocally(callId: string, reason: string, notifyServer = false) {
  if (notifyServer) hangupOnServer(callId);
  teardown();
  emit('ended', { callId, reason });
}

/** The callee picked up: stop ringing and (as the caller) start the media. */
async function onAccepted(callId: string, byUserId: string) {
  if (!call || !isCurrent(callId) || call.accepted) return;
  call.accepted = true;
  clearRingTimer();
  emit('accepted', { callId, byUserId });
  if (call.role === 'caller') {
    try { await makeOffer(); } catch (e) { failCall('media-error', e); }
  }
}

/** Signaling is back after a loss: bring the call in line with the server's
    persisted session — whatever was sent while we were away never arrived. */
async function reconcile(conn: HubConnection) {
  for (const [callId, method] of [...unsentEnds]) {
    unsentEnds.delete(callId);
    await conn.invoke(method, callId).catch(() => { /* already over on the server */ });
  }
  const c = call;
  if (!c) return;
  let session: { status?: string } | null;
  try {
    session = await conn.invoke('GetCall', c.callId);
  } catch {
    return; // unknown (older server, hiccup): keep the call as it is
  }
  if (!isCurrent(c.callId)) return;
  const status = String(session?.status || '').toLowerCase();

  if (status === 'ringing') return;
  if (status === 'accepted') {
    if (c.role === 'caller') {
      if (!c.accepted) await onAccepted(c.callId, c.peerId);
      else if (pc) recovery?.retry(pc.connectionState);
    } else if (!c.accepted) {
      endLocally(c.callId, 'remote'); // answered on another of our devices
    } else if (pc) {
      recovery?.retry(pc.connectionState);
    }
    return;
  }
  // Declined, ended, missed — or no such call any more.
  if (status === 'rejected' && c.role === 'caller') { teardown(); emit('rejected', { callId: c.callId }); return; }
  endLocally(c.callId, 'remote');
}

function wireHandlers(conn: HubConnection) {
  conn.on('IncomingCall', (invite: { callId: string; fromUserId: string }) => {
    // The same invite again (re-offered after a reconnect): we are ringing already.
    if (call?.callId === invite.callId) return;
    if (call) { sendEnd('RejectCall', invite.callId); return; } // busy on another call
    call = { callId: invite.callId, peerId: invite.fromUserId, role: 'callee', accepted: false };
    armRingTimer(CALLEE_RING_TIMEOUT_MS);
    getIceServers().catch(() => {}); // warm the TURN credentials while ringing
    emit('incoming', invite);
  });

  conn.on('CallAccepted', (callId: string, byUserId: string) => onAccepted(callId, byUserId));

  conn.on('CallRejected', (callId: string) => {
    if (!isCurrent(callId)) return;
    teardown();
    emit('rejected', { callId });
  });

  conn.on('CallEnded', (callId: string) => {
    if (isCurrent(callId)) endLocally(callId, 'remote');
  });

  conn.on('ReceiveOffer', async (payload: { callId: string; sdp: string }) => {
    const c = call;
    if (!c || !isCurrent(payload.callId)) return;
    try {
      const peer = await ensurePeer();
      await peer.setRemoteDescription({ type: 'offer', sdp: payload.sdp });
      clearRingTimer(); // the caller's side is alive (see acceptCall)
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
    if (!isCurrent(payload.callId) || !peer) return;
    try {
      await peer.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
      await drainIce(peer);
    } catch (e) {
      failCall('media-error', e);
    }
  });

  conn.on('ReceiveIceCandidate', async (payload: { callId: string; candidate: string; sdpMid: string; sdpMLineIndex: number }) => {
    if (!isCurrent(payload.callId)) return;
    const candidate: RTCIceCandidateInit = {
      candidate: payload.candidate,
      sdpMid: payload.sdpMid,
      sdpMLineIndex: payload.sdpMLineIndex,
    };
    if (pc && pc.remoteDescription) await pc.addIceCandidate(candidate).catch(() => {});
    else pendingIce.push(candidate);
  });

  // "Ride together" offer during the call, and the answer to ours.
  conn.on('RideOffer', (callId: string, fromUserId: string) => {
    if (isCurrent(callId)) emit('rideOffer', { callId, fromUserId });
  });
  conn.on('RideOfferAnswered', (callId: string, byUserId: string, accepted: boolean) => {
    if (isCurrent(callId)) emit('rideOfferAnswered', { callId, byUserId, accepted });
  });
  // No onclose teardown: the P2P audio may outlive a signaling blip. Ringing is
  // bounded by the ring timers, a live call by mediaRecovery, and `reconcile`
  // settles the rest once the socket is back.
}

/** Abort the active call after an unrecoverable local error. */
function failCall(reason: string, err?: unknown) {
  if (err && import.meta.env?.DEV) console.warn(`[call] ${reason}:`, (err as Error)?.message || err);
  if (call) endLocally(call.callId, reason, true);
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
      // Refresh at 80% of the credential lifetime so a call never starts on stale TURN auth.
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
      hub.current()?.invoke('SendIceCandidate', call.peerId, call.callId,
        e.candidate.candidate, e.candidate.sdpMid, e.candidate.sdpMLineIndex).catch(() => {});
    }
  };

  peer.ontrack = (e) => {
    const [remote] = e.streams;
    attachRemoteAudio(remote);
    emit('remoteStream', remote);
  };

  recovery?.dispose();
  recovery = createMediaRecovery({
    canRestart: () => call?.role === 'caller' && pc === peer && hub.isConnected(),
    restart: () => { restartIce(peer).catch(() => { /* retried on the next state change / reconnect */ }); },
    giveUp: () => { if (pc === peer) failCall('connection'); },
  });
  peer.onconnectionstatechange = () => { if (pc === peer) recovery?.onState(peer.connectionState); };

  return peer;
}

/** Caller: re-negotiate the media path over fresh ICE candidates (network changed).
    The callee answers it through the ordinary ReceiveOffer path. */
async function restartIce(peer: RTCPeerConnection) {
  const c = call;
  const conn = hub.connected();
  if (!c || !conn || pc !== peer || peer.signalingState !== 'stable') return;
  const offer = await peer.createOffer({ iceRestart: true });
  await peer.setLocalDescription(offer);
  await conn.invoke('Reconnect', c.peerId, c.callId, offer.sdp);
}

async function makeOffer() {
  const peer = await ensurePeer();
  const c = call;
  if (!c) return;
  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  await hub.current()?.invoke('SendOffer', c.peerId, c.callId, offer.sdp);
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
  recovery?.dispose();
  recovery = null;
  pendingIce.length = 0;
  if (pc) { try { pc.close(); } catch { /* ignore */ } pc = null; }
  if (localStream) { localStream.getTracks().forEach((t) => t.stop()); localStream = null; }
  if (remoteAudioEl) { remoteAudioEl.srcObject = null; }
  call = null;
}

// --- public API -------------------------------------------------------

export const callClient = {
  on,
  connect: hub.connect,
  isConnected: hub.isConnected,

  async disconnect() {
    teardown();
    await hub.disconnect();
  },

  /** Caller: ring `toUserId`. Audio is negotiated once they accept. */
  async startCall(toUserId: string, callType = 'audio'): Promise<string> {
    const conn = hub.connected();
    if (!conn) throw appError('REALTIME_OFFLINE');
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
      await hub.current()?.invoke('AcceptCall', c.callId);
      c.accepted = true;
    } catch (e) {
      teardown();
      throw e;
    }
    // Never sit in a silent call: if the caller's offer does not follow, give up.
    ringTimer = setTimeout(() => { if (isCurrent(c.callId) && !pc?.remoteDescription) failCall('connection'); },
      OFFER_TIMEOUT_MS);
    getMic().catch((e) => failCall('mic-denied', e));
  },

  /** Callee: reject the current incoming call. */
  async rejectCall() {
    if (!call) return;
    const { callId } = call;
    teardown();
    await sendEnd('RejectCall', callId);
  },

  /** Either side: hang up an in-progress (or ringing) call. */
  async hangup() {
    if (!call) return;
    const { callId } = call;
    teardown();
    await sendEnd('Hangup', callId);
  },

  /** Offer the peer to ride together (answered via 'rideOfferAnswered'). */
  sendRideOffer(): Promise<void> {
    const c = call;
    const conn = hub.connected();
    if (!c || !conn) return Promise.reject(appError('REALTIME_OFFLINE'));
    return conn.invoke('SendRideOffer', c.peerId, c.callId);
  },

  /** Answer the peer's ride offer. */
  respondRideOffer(accepted: boolean): Promise<void> {
    const c = call;
    const conn = hub.connected();
    if (!c || !conn) return Promise.reject(appError('REALTIME_OFFLINE'));
    return conn.invoke('RespondRideOffer', c.peerId, c.callId, accepted);
  },

  /** Mute/unmute the local mic without renegotiating. */
  setMuted(muted: boolean) {
    localStream?.getAudioTracks().forEach((t) => { t.enabled = !muted; });
  },

  currentCall: (): CallState | null => call,
};
