/* ════════════════════════════════════════════════════════════════
   SIGNALR — shared connection factory.
   Builds a HubConnection that authenticates with the same JWT the REST
   client uses (the backend's JwtBearer handler reads it from the
   `access_token` query string for /hubs/* paths) and reconnects on drop.
   ════════════════════════════════════════════════════════════════ */

import { HubConnectionBuilder, HttpTransportType, LogLevel } from '@microsoft/signalr';
import { authStore } from '@/services/authStore';

const env = import.meta.env || {};
const HUB_BASE = (env.VITE_HUB_BASE_URL || '').replace(/\/$/, '');

/**
 * Create (but do not start) a hub connection for the given hub path.
 * @param {string} path e.g. '/hubs/presence'
 */
export function createHubConnection(path) {
  return new HubConnectionBuilder()
    .withUrl(`${HUB_BASE}${path}`, {
      accessTokenFactory: () => authStore.getAccessToken() || '',
      // WebSockets first; SignalR falls back automatically if unavailable.
      transport: HttpTransportType.WebSockets | HttpTransportType.LongPolling,
    })
    .withAutomaticReconnect([0, 2000, 5000, 10000])
    .configureLogging(import.meta.env?.DEV ? LogLevel.Warning : LogLevel.Error)
    .build();
}

/** Start a connection, swallowing the "already started" race during reconnects. */
export async function startConnection(connection) {
  if (!connection) return;
  try {
    if (connection.state === 'Disconnected') await connection.start();
  } catch (err) {
    // Surfaced by callers via the connection's onclose handler; log for dev.
    if (import.meta.env?.DEV) console.warn('[signalr] start failed:', err?.message || err);
    throw err;
  }
}
