/* REPOSITORY — voice calls (REST side). Live signaling itself flows over the
   CallHub (services/realtime/callClient); this module only fetches the ICE
   configuration WebRTC needs to punch through NATs. */

import { USE_MOCKS, mockResponse, http } from './client';

// STUN-only default: mirrors the backend's fallback when TURN isn't configured.
const DEFAULT_ICE = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302'], username: null, credential: null }],
  ttlSeconds: 3600,
};

export const callApi = {
  /** GET /calls/ice-servers — STUN + (when configured) TURN with per-user
      ephemeral credentials. Fetched right before a call; valid for ttlSeconds. */
  iceServers() {
    if (USE_MOCKS) return mockResponse(DEFAULT_ICE);
    return http('/calls/ice-servers');
  },
};
