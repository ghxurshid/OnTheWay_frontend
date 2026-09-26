/* ════════════════════════════════════════════════════════════════
   WebRTC media recovery for a 1:1 call. Audio flows peer-to-peer, so a
   network change (Wi-Fi → mobile data, a tunnel) breaks the media path even
   when signaling survives. An ICE restart re-gathers candidates on the new
   network (RFC 8445 §2.4; RTCPeerConnection createOffer({ iceRestart })).
   Only the caller — the side that makes offers — restarts, so the two ends
   never send crossing offers ("glare"). 'disconnected' often heals on its
   own, so it gets a short grace first; if the media is not back within the
   recovery window the call is given up.
   ════════════════════════════════════════════════════════════════ */

/** How long a 'disconnected' peer may heal by itself before an ICE restart. */
export const DISCONNECTED_GRACE_MS = 2500;
/** How long the media may stay broken before the call is dropped. */
export const RECOVERY_WINDOW_MS = 20_000;

const BROKEN = new Set<RTCPeerConnectionState>(['disconnected', 'failed']);

interface MediaRecoveryOptions {
  /** True when this side may restart ICE right now (the caller, signaling up). */
  canRestart: () => boolean;
  /** Start an ICE restart (create + send an iceRestart offer). */
  restart: () => void;
  /** The media did not come back in time. */
  giveUp: () => void;
}

export function createMediaRecovery({ canRestart, restart, giveUp }: MediaRecoveryOptions) {
  let graceTimer: ReturnType<typeof setTimeout> | null = null;
  let giveUpTimer: ReturnType<typeof setTimeout> | null = null;

  const clearGrace = () => { if (graceTimer) { clearTimeout(graceTimer); graceTimer = null; } };
  const clearAll = () => {
    clearGrace();
    if (giveUpTimer) { clearTimeout(giveUpTimer); giveUpTimer = null; }
  };

  const tryRestart = (state: RTCPeerConnectionState) => {
    if (!canRestart()) return;
    if (state === 'failed') { clearGrace(); restart(); return; }
    if (!graceTimer) graceTimer = setTimeout(() => { graceTimer = null; if (canRestart()) restart(); }, DISCONNECTED_GRACE_MS);
  };

  return {
    /** Feed every RTCPeerConnection connectionState change. */
    onState(state: RTCPeerConnectionState) {
      if (!BROKEN.has(state)) { clearAll(); return; } // connected / connecting / new / closed
      if (!giveUpTimer) giveUpTimer = setTimeout(() => { clearAll(); giveUp(); }, RECOVERY_WINDOW_MS);
      tryRestart(state);
    },
    /** Signaling came back: if the media is still broken, restart now. */
    retry(state: RTCPeerConnectionState) {
      if (BROKEN.has(state)) { clearGrace(); if (canRestart()) restart(); }
    },
    dispose: clearAll,
  };
}
