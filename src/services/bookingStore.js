/* ════════════════════════════════════════════════════════════════
   SERVICE — ride-agreement (booking) state the current walker is part of.
   Seeded from the server session snapshot on boot and kept current by realtime
   BookingEvents (create/accept/reject/cancel/complete). localStorage-cached so
   it survives a reload; the REST API remains the source of truth.
   ════════════════════════════════════════════════════════════════ */

const KEY = 'ontheway_bookings_v1';

let state = load(); // { [id]: { ...booking, incoming, lastEvent } }
const listeners = new Set();

function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } }
function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ } }
function emit() {
  listeners.forEach((fn) => { try { fn(state); } catch (e) { console.error('[booking]', e); } });
  window.dispatchEvent(new Event('ontheway:bookings'));
}

export const bookingStore = {
  get: () => state,
  list: () => Object.values(state),
  /** Pending requests awaiting my action as the trip owner (driver). */
  incoming: () => Object.values(state).filter((b) => b.incoming && b.status === 'Pending'),
  /** Bookings I hold that are currently accepted (an active agreement). */
  accepted: () => Object.values(state).filter((b) => b.status === 'Accepted'),
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  /** Apply a realtime BookingEvent: { type, booking, actorUserId }. */
  apply(evt) {
    if (!evt || !evt.booking) return;
    const b = evt.booking;
    const id = String(b.id);
    // A 'requested' event reaches the trip owner — it's an incoming request.
    const incoming = evt.type === 'requested';
    state = { ...state, [id]: { ...b, id, incoming, lastEvent: evt.type } };
    persist(); emit();
  },

  /** Seed from the boot snapshot's bookings (the caller's own bookings). */
  seed(bookings) {
    if (!Array.isArray(bookings)) return;
    const next = { ...state };
    bookings.forEach((b) => { const id = String(b.id); next[id] = { ...b, id, incoming: false }; });
    state = next; persist(); emit();
  },

  reset() { state = {}; persist(); emit(); },
};
