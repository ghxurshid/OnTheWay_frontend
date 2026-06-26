/* Date / time helpers and the shared "now" reference used by mock data. */

// Single reference timestamp so mock trips/history render deterministically
// relative to app launch (kept from the prototype).
export const NOW = new Date();

/** Build a Date for today at h:m. */
export const dt = (h, m) => { const d = new Date(NOW); d.setHours(h, m, 0, 0); return d; };

/** 24h HH:MM. */
export const fmt12 = (d) => d.toLocaleTimeString('uz', { hour: '2-digit', minute: '2-digit', hour12: false });

/** Short "dd mon" date. */
export const fmtDate = (d) => d.toLocaleDateString('uz', { day: '2-digit', month: 'short' });

/** Hour label e.g. "08:00". */
export const hLabel = (h) => `${String(h).padStart(2, '0')}:00`;
