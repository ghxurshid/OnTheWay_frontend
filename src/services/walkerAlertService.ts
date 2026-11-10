/* ════════════════════════════════════════════════════════════════
   SERVICE — "tell me when someone appears" (the one-shot walker alert).
   ────────────────────────────────────────────────────────────────
   The empty map promises to tell the user as soon as someone appears, and
   in a Mini App the user usually closes the app right after. So the alert
   lives on the server (presence hub): it keeps the position at set time and
   the role, expires, and goes off once — here as WalkerAlertFired (→ the
   toast), in a closed app as a Telegram message.

   Sync model: what the user asked for is applied on screen at once and sent;
   unsent it stays in localStorage (only the latest wish, a restart included)
   and goes out on the next connect. After every connect the server's answer
   replaces the local "on": it may have fired, expired or been changed on
   another device meanwhile. The cached value only covers the moments before
   that answer.

   Demo mode has no server: the state is local and in-memory, and App fires it
   when the first simulated walker shows up.
   ════════════════════════════════════════════════════════════════ */

import type { HubConnection } from '@microsoft/signalr';
import { USE_MOCKS } from '@/api/client';
import { getCurrentLatLng } from '@/services/geolocation';
import { presenceClient } from '@/services/realtime';
import { createBackoff, isHubRefusal } from '@/services/realtime/retry';
import { notifyStoreChange, readJson, writeJson } from '@/utils/storage';
import type { LatLng } from '@/utils/geo';
import type { PartyType } from '@/models';

export const WALKER_ALERT_EVENT = 'ontheway:walker-alert';

const KEY = 'ontheway_walker_alert_v1';
/** The server's alert lifetime (WalkerAlertLimits.Lifetime): a wish older than
    this, still unsent, is void — and a cached "on" cannot be true any more. */
const LIFETIME_MS = 3 * 60 * 60 * 1000;

type Wish =
  | { kind: 'set'; role: PartyType; lat: number; lng: number; at: number }
  | { kind: 'clear' };

interface Saved { on: boolean; until: number | null; wish: Wish | null }

/** The hub's WalkerAlertDto (only what this side reads). */
interface WalkerAlertDto { expiresAtUtc?: string }

function load(): Saved {
  const saved = USE_MOCKS ? null : readJson<Saved | null>(KEY, null);
  if (!saved) return { on: false, until: null, wish: null };
  const now = Date.now();
  const stale = saved.wish?.kind === 'set' && now - saved.wish.at > LIFETIME_MS;
  return {
    on: saved.on && !stale && (saved.until == null || now < saved.until),
    until: saved.until,
    wish: stale ? null : saved.wish,
  };
}

const initial = load();
let on = initial.on;
let until = initial.until;
let wish: Wish | null = initial.wish;
const listeners = new Set<() => void>();
/** The walker who set it off last, and when (the map's "joined" toast defers to it). */
let lastFired: { walkerUserId: string; at: number } | null = null;

function commit(nextOn: boolean, nextUntil: number | null): void {
  const changed = nextOn !== on;
  on = nextOn;
  until = nextOn ? nextUntil : null;
  if (!USE_MOCKS) writeJson(KEY, on || wish ? { on, until, wish } : null);
  if (changed) notifyStoreChange(WALKER_ALERT_EVENT);
}

/** The server's word on the alert. */
function apply(alert: WalkerAlertDto | null | undefined): void {
  if (!alert) { commit(false, null); return; }
  const expires = alert.expiresAtUtc ? Date.parse(alert.expiresAtUtc) : NaN;
  commit(true, Number.isFinite(expires) ? expires : Date.now() + LIFETIME_MS);
}

function fired(dto?: { walkerUserId?: string } | null): void {
  if (dto?.walkerUserId != null) lastFired = { walkerUserId: String(dto.walkerUserId), at: Date.now() };
  commit(false, null);
  listeners.forEach((fn) => { try { fn(); } catch (e) { console.error('[walkerAlert]', e); } });
}

let delivering: Promise<void> | null = null;
let again = false;
const retry = createBackoff(() => { deliver(); });

/** Send the latest wish over `conn` (default: the live connection). Stops when the
    socket drops (the next connect resumes); a wish the server refuses is over (the
    alert is simply not armed); a server fault is retried soon. */
function deliver(conn?: HubConnection): Promise<void> {
  if (delivering) { again = true; return delivering; }
  delivering = (async () => {
    while (wish) {
      const c = conn && conn.state === 'Connected' ? conn : presenceClient.connection();
      if (!c) return;
      const sending: Wish = wish;
      let answer: WalkerAlertDto | null | undefined;
      try {
        answer = sending.kind === 'set'
          ? await c.invoke<WalkerAlertDto | null>('SetWalkerAlert', sending.role, sending.lat, sending.lng)
          : await c.invoke('ClearWalkerAlert').then(() => null);
      } catch (e) {
        if (c.state !== 'Connected') return; // lost mid-way: the next connect retries it
        if (!isHubRefusal(e)) { retry.schedule(); return; } // a server fault: the wish stands
        answer = null;
      }
      if (wish !== sending) continue; // the user changed their mind meanwhile: send that
      wish = null;
      apply(answer);
    }
    retry.reset();
  })().finally(() => {
    delivering = null;
    if (again) { again = false; deliver(); }
  });
  return delivering;
}

/** After a (re)connect: deliver the unsent wish, then take the server's word. */
async function catchUp(conn: HubConnection): Promise<void> {
  await deliver(conn);
  if (wish) return; // cut short: the wish stands until it is delivered
  let alert: WalkerAlertDto | null;
  try {
    alert = await conn.invoke<WalkerAlertDto | null>('GetWalkerAlert');
  } catch (e) {
    if (conn.state !== 'Connected') throw e;
    return; // an older server: keep what we have
  }
  if (!wish) apply(alert);
}

presenceClient.on('WalkerAlertChanged', (alert: WalkerAlertDto | null) => { if (!wish) apply(alert); });
presenceClient.on('WalkerAlertFired', fired);
presenceClient.onResync(catchUp);
if (typeof window !== 'undefined') window.addEventListener('online', () => { deliver(); });

export const walkerAlertService = {
  /** Whether the alert is on (a stable boolean for useStoreEvent). */
  isOn: (): boolean => on,

  /** Turn it on for the search `role`, around `position` (the device is asked when
      unknown). Resolves false when no position can be had — there is nothing to
      measure "nearby" from, so nothing is promised. */
  async enable(role: PartyType, position: LatLng | null): Promise<boolean> {
    if (USE_MOCKS) { commit(true, null); return true; }
    const at = position || await getCurrentLatLng();
    if (!at) return false;
    wish = { kind: 'set', role, lat: at[0], lng: at[1], at: Date.now() };
    commit(true, Date.now() + LIFETIME_MS);
    deliver();
    return true;
  },

  /** Turn it off (nothing to do when it is off already). */
  disable(): void {
    if (!on && !wish) return;
    if (USE_MOCKS) { commit(false, null); return; }
    wish = { kind: 'clear' };
    commit(false, null);
    deliver();
  },

  /** It went off while this app is open (time for the toast). Returns an unsubscribe. */
  onFired(fn: () => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },

  /** Demo mode: a simulated walker showed up. */
  fireLocally(): void { if (USE_MOCKS && on) fired(); },

  /** Whether `walkerUserId` set the alert off within `withinMs` — that walker's own
      "joined" toast would only repeat the alert's. */
  firedFor(walkerUserId: string, withinMs = 5_000): boolean {
    return !!lastFired && lastFired.walkerUserId === String(walkerUserId) && Date.now() - lastFired.at <= withinMs;
  },

  /** The unsent wish (tests / diagnostics). */
  pending: (): Wish | null => wish,
};
