/* ════════════════════════════════════════════════════════════════
   CALL CLIENT — /hubs/call (singleton) + WebRTC audio.
   ────────────────────────────────────────────────────────────────
   The hub ONLY relays signaling (call lifecycle + SDP/ICE). Audio media
   flows peer-to-peer over WebRTC and never touches the backend. This client
   wires the two together behind a small high-level API the CallScreen uses:

     startCall(toUserId, type) → ring + (on accept) negotiate audio
     acceptCall() / rejectCall() / hangup()
     on('incoming'|'accepted'|'rejected'|'ended'|'remoteStream', handler)
   ════════════════════════════════════════════════════════════════ */

import { createHubConnection, startConnection } from './hubConnection';

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

let connection = null;
const listeners = new Map();

// Active call state (one 1:1 call at a time).
let call = null; // { callId, peerId, role: 'caller'|'callee', accepted }
let pc = null; // RTCPeerConnection
let localStream = null;
let remoteAudioEl = null;
const pendingIce = []; // ICE candidates that arrived before the remote description

function emit(event, payload) {
  listeners.get(event)?.forEach((fn) => {
    try { fn(payload); } catch (e) { console.error(`[call] ${event} handler`, e); }
  });
}

function ensureConnection() {
  if (connection) return connection;
  connection = createHubConnection('/hubs/call');

  connection.on('IncomingCall', (invite) => {
    // Ignore a second incoming call while one is active.
    if (call) { connection.invoke('RejectCall', invite.callId, invite.fromUserId).catch(() => {}); return; }
    call = { callId: invite.callId, peerId: invite.fromUserId, role: 'callee', accepted: false };
    emit('incoming', invite);
  });

  connection.on('CallAccepted', async (callId, byUserId) => {
    if (!call || call.callId !== callId) return;
    call.accepted = true;
    emit('accepted', { callId, byUserId });
    // The caller drives negotiation once the callee picks up.
    if (call.role === 'caller') await makeOffer();
  });

  connection.on('CallRejected', (callId) => {
    if (call && call.callId !== callId) return;
    emit('rejected', { callId });
    teardown();
  });

  connection.on('CallEnded', (callId) => {
    if (call && call.callId !== callId) return;
    emit('ended', { callId });
    teardown();
  });

  connection.on('ReceiveOffer', async (payload) => {
    if (!call || call.callId !== payload.callId) return;
    await ensurePeer();
    await pc.setRemoteDescription({ type: 'offer', sdp: payload.sdp });
    await drainIce();
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await connection.invoke('SendAnswer', call.peerId, call.callId, answer.sdp);
  });

  connection.on('ReceiveAnswer', async (payload) => {
    if (!call || call.callId !== payload.callId || !pc) return;
    await pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
    await drainIce();
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

  return connection;
}

// --- WebRTC plumbing --------------------------------------------------

async function getMic() {
  if (localStream) return localStream;
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  return localStream;
}

async function ensurePeer() {
  if (pc) return pc;
  pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

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

  pc.onconnectionstatechange = () => {
    if (pc && (pc.connectionState === 'failed' || pc.connectionState === 'closed')) emit('ended', { callId: call?.callId });
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
    await getMic(); // prompt for the mic up front so accept is instant
    const callId = await connection.invoke('InitiateCall', toUserId, callType);
    call = { callId, peerId: toUserId, role: 'caller', accepted: false };
    return callId;
  },

  /** Callee: accept the current incoming call. */
  async acceptCall() {
    if (!call || call.role !== 'callee') return;
    await getMic();
    await connection.invoke('AcceptCall', call.callId, call.peerId);
  },

  /** Callee: reject the current incoming call. */
  async rejectCall() {
    if (!call) return;
    try { await connection.invoke('RejectCall', call.callId, call.peerId); } catch { /* ignore */ }
    teardown();
  },

  /** Either side: hang up an in-progress (or ringing) call. */
  async hangup() {
    if (!call) return;
    try { await connection.invoke('Hangup', call.callId, call.peerId); } catch { /* ignore */ }
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
