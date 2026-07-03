/* ════════════════════════════════════════════════════════════════
   CALL CLIENT — /hubs/call (singleton) + WebRTC audio.
   ────────────────────────────────────────────────────────────────
   The hub ONLY relays signaling (call lifecycle + SDP/ICE). Audio media
   flows peer-to-peer over WebRTC and never touches the backend. This client
   wires the two together behind a small high-level API the CallScreen uses:

     startCall(toUserId, type) → ring + (on accept) negotiate audio
     acceptCall() / rejectCall() / hangup()
     on('incoming'|'accepted'|'rejected'|'ended'|'remoteStream', handler)

   Sync guarantees (both sides always converge):
     - accept is SIGNALED FIRST, then the mic is acquired — a slow/denied
       permission prompt can no longer leave the caller ringing forever;
     - unanswered calls time out on the caller (hangup → callee dismissed)
       with a callee-side fallback in case the caller vanished;
     - a failed P2P connection or a dropped hub connection tears the call
       down and emits 'ended' — stale state never blocks the next call.
   ════════════════════════════════════════════════════════════════ */

import { createHubConnection, startConnection } from './hubConnection';
import { callApi } from '@/api/callApi';

// Used only when /calls/ice-servers is unreachable: STUN-only still connects
// direct P2P on open NATs; the TURN relay needs backend-issued credentials.
const FALLBACK_ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

// Unanswered-call limits: the caller gives up first (and tells the server, so
// the callee is dismissed too); the callee timer is only a safety net for a
// caller that disappeared without a hangup reaching us.
const CALLER_RING_TIMEOUT_MS = 40_000;
const CALLEE_RING_TIMEOUT_MS = 50_000;

let connection = null;
const listeners = new Map();

// Active call state (one 1:1 call at a time).
let call = null; // { callId, peerId, role: 'caller'|'callee', accepted }
let pc = null; // RTCPeerConnection
let localStream = null;
let micPromise = null; // single-flight getUserMedia (accept + offer can race)
let remoteAudioEl = null;
let ringTimer = null; // unanswered-call timeout (either role)
const pendingIce = []; // ICE candidates that arrived before the remote description

function emit(event, payload) {
  listeners.get(event)?.forEach((fn) => {
    try { fn(payload); } catch (e) { console.error(`[call] ${event} handler`, e); }
  });
}

function clearRingTimer() {
  if (ringTimer) { clearTimeout(ringTimer); ringTimer = null; }
}

/** Ring timeout: notify the server (marks the session Missed and dismisses the
    peer), tear down locally and surface 'ended' so the UI closes. */
function armRingTimer(ms) {
  clearRingTimer();
  ringTimer = setTimeout(() => {
    if (!call || call.accepted) return;
    const callId = call.callId;
    connection?.invoke('Hangup', callId).catch(() => {});
    teardown();
    emit('ended', { callId, reason: 'timeout' });
  }, ms);
}

function ensureConnection() {
  if (connection) return connection;
  connection = createHubConnection('/hubs/call');

  connection.on('IncomingCall', (invite) => {
    // Busy: auto-reject a second incoming call while one is active.
    if (call) { connection.invoke('RejectCall', invite.callId).catch(() => {}); return; }
    call = { callId: invite.callId, peerId: invite.fromUserId, role: 'callee', accepted: false };
    armRingTimer(CALLEE_RING_TIMEOUT_MS);
    getIceServers().catch(() => {}); // warm the TURN credentials while ringing
    emit('incoming', invite);
  });

  connection.on('CallAccepted', async (callId, byUserId) => {
    if (!call || call.callId !== callId) return;
    call.accepted = true;
    clearRingTimer();
    emit('accepted', { callId, byUserId });
    // The caller drives negotiation once the callee picks up.
    if (call.role === 'caller') {
      try { await makeOffer(); } catch (e) { failCall('media-error', e); }
    }
  });

  connection.on('CallRejected', (callId) => {
    if (!call || call.callId !== callId) return;
    teardown();
    emit('rejected', { callId });
  });

  connection.on('CallEnded', (callId) => {
    if (!call || call.callId !== callId) return;
    teardown();
    emit('ended', { callId, reason: 'remote' });
  });

  connection.on('ReceiveOffer', async (payload) => {
    if (!call || call.callId !== payload.callId) return;
    try {
      await ensurePeer();
      await pc.setRemoteDescription({ type: 'offer', sdp: payload.sdp });
      await drainIce();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await connection.invoke('SendAnswer', call.peerId, call.callId, answer.sdp);
    } catch (e) {
      failCall('media-error', e);
    }
  });

  connection.on('ReceiveAnswer', async (payload) => {
    if (!call || call.callId !== payload.callId || !pc) return;
    try {
      await pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
      await drainIce();
    } catch (e) {
      failCall('media-error', e);
    }
  });

  connection.on('ReceiveIceCandidate', async (payload) => {
    if (!call || call.callId !== payload.callId) return;
    const candidate = {
      candidate: payload.candidate,
      sdpMid: payload.sdpMid,
      sdpMLineIndex: payload.sdpMLineIndex,
    };
    if (pc && pc.remoteDescription) await pc.addIceCandidate(candidate).catch(() => {});
    else pendingIce.push(candidate);
  });

  // The signaling channel died for good (auto-reconnect gave up): the peers can
  // no longer coordinate, so end the call instead of leaving a stuck screen.
  connection.onclose(() => {
    if (!call) return;
    const callId = call.callId;
    teardown();
    emit('ended', { callId, reason: 'connection' });
  });

  return connection;
}

/** Abort the active call after an unrecoverable local error (mic/SDP/P2P):
    tell the server (so the peer is dismissed), clean up, surface 'ended'. */
function failCall(reason, err) {
  if (err && import.meta.env?.DEV) console.warn(`[call] ${reason}:`, err?.message || err);
  if (!call) return;
  const callId = call.callId;
  connection?.invoke('Hangup', callId).catch(() => {});
  teardown();
  emit('ended', { callId, reason });
}

// --- WebRTC plumbing --------------------------------------------------

let iceCache = null; // { servers, expiresAt } — TURN credentials are ephemeral

/** ICE servers for the next RTCPeerConnection. Cached while the backend-issued
    TURN credentials are still fresh (80% of their TTL); prefetched on ring so
    negotiation doesn't wait on the round-trip. Falls back to STUN-only. */
async function getIceServers() {
  if (iceCache && Date.now() < iceCache.expiresAt) return iceCache.servers;
  try {
    const dto = await callApi.iceServers();
    const servers = (dto?.iceServers || [])
      .filter((s) => s && s.urls && s.urls.length)
      .map((s) => (s.username && s.credential
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

function getMic() {
  if (localStream) return Promise.resolve(localStream);
  if (!micPromise) {
    micPromise = navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      .then((stream) => { localStream = stream; return stream; })
      .finally(() => { micPromise = null; });
  }
  return micPromise;
}

let peerPromise = null; // single-flight: offer handling must not double-create

function ensurePeer() {
  if (pc) return Promise.resolve(pc);
  if (!peerPromise) peerPromise = createPeer().finally(() => { peerPromise = null; });
  return peerPromise;
}

async function createPeer() {
  const iceServers = await getIceServers();
  if (pc) return pc; // created while we awaited
  pc = new RTCPeerConnection({ iceServers });

  const stream = await getMic();
  stream.getTracks().forEach((track) => pc.addTrack(track, stream));

  pc.onicecandidate = (e) => {
    if (e.candidate && call) {
      connection.invoke('SendIceCandidate', call.peerId, call.callId,
        e.candidate.candidate, e.candidate.sdpMid, e.candidate.sdpMLineIndex).catch(() => {});
    }
  };

  pc.ontrack = (e) => {
    const [stream] = e.streams;
    attachRemoteAudio(stream);
    emit('remoteStream', stream);
  };

  // 'failed' is terminal — clean up fully (a lingering `call` would silently
  // auto-reject every future incoming call) and tell the server/peer.
  pc.onconnectionstatechange = () => {
    if (pc && pc.connectionState === 'failed') failCall('connection');
  };

  return pc;
}

async function makeOffer() {
  await ensurePeer();
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await connection.invoke('SendOffer', call.peerId, call.callId, offer.sdp);
}

async function drainIce() {
  while (pendingIce.length) {
    await pc.addIceCandidate(pendingIce.shift()).catch(() => {});
  }
}

function attachRemoteAudio(stream) {
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
  on(event, handler) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(handler);
    return () => listeners.get(event)?.delete(handler);
  },

  async connect() {
    await startConnection(ensureConnection());
  },

  async disconnect() {
    teardown();
    if (connection) { try { await connection.stop(); } catch { /* ignore */ } }
    connection = null;
  },

  isConnected() {
    return connection?.state === 'Connected';
  },

  /** Caller: ring `toUserId`. Audio is negotiated once they accept. */
  async startCall(toUserId, callType = 'audio') {
    if (!this.isConnected()) throw new Error('Call hub not connected');
    getIceServers().catch(() => {}); // warm the TURN credentials while ringing
    await getMic(); // prompt for the mic up front so accept is instant
    const callId = await connection.invoke('InitiateCall', toUserId, callType);
    call = { callId, peerId: toUserId, role: 'caller', accepted: false };
    armRingTimer(CALLER_RING_TIMEOUT_MS);
    return callId;
  },

  /** Callee: accept the current incoming call. The accept is signaled FIRST —
      so both screens flip to "connected" together — and only then is the mic
      acquired in the background (the browser prompt can be slow or denied; a
      denial ends the call for both sides via the 'ended' event). Rejects only
      when the server refused the accept (e.g. the caller already hung up). */
  async acceptCall() {
    if (!call || call.role !== 'callee') return;
    clearRingTimer();
    try {
      await connection.invoke('AcceptCall', call.callId);
      call.accepted = true;
    } catch (e) {
      // Server refused (caller already hung up / session gone) — clean up.
      teardown();
      throw e;
    }
    getMic().catch((e) => failCall('mic-denied', e));
  },

  /** Callee: reject the current incoming call. */
  async rejectCall() {
    if (!call) return;
    try { await connection.invoke('RejectCall', call.callId); } catch { /* ignore */ }
    teardown();
  },

  /** Either side: hang up an in-progress (or ringing) call. */
  async hangup() {
    if (!call) return;
    try { await connection.invoke('Hangup', call.callId); } catch { /* ignore */ }
    teardown();
  },

  /** Mute/unmute the local mic without renegotiating. */
  setMuted(muted) {
    localStream?.getAudioTracks().forEach((t) => { t.enabled = !muted; });
  },

  currentCall() {
    return call;
  },
};
