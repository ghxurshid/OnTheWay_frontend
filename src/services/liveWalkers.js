/* ════════════════════════════════════════════════════════════════
   SERVICE — live walkers.
   Merges a WalkerProfileDto (REST /walkers/online) with a live
   WalkerPositionDto (PresenceHub) into the enriched walker shape the map
   + popup expect. Position-only — unlike simulated walkers there is no
   precomputed route (a route appears only if the walker publishes one).
   ════════════════════════════════════════════════════════════════ */

const PALETTE = [
  '#1fc8c0', '#f0a832', '#a78bfa', '#ff5c72', '#2ecc8e',
  '#4d9fff', '#ff8a4d', '#e85ad6', '#5fd0e0', '#ffd24d',
];

/** Stable colour per user id (so a walker keeps the same colour across ticks). */
export function colorForId(id) {
  const s = String(id || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function initialsOf(name) {
  if (!name) return '👤';
  return name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

/** Build the enriched walker the map renders + the popup formats. */
export function enrichLiveWalker(profile, pos) {
  return {
    id: profile.id,
    type: profile.kind === 'driver' ? 'driver' : 'passenger',
    name: profile.name || 'Walker',
    initials: initialsOf(profile.name),
    color: colorForId(profile.id),
    vehicle: profile.vehicle || null,
    rating: typeof profile.rating === 'number' ? profile.rating : null,
    photoUrl: profile.photoUrl || null,
    position: pos ? [pos.lat, pos.lng] : null,
    heading: pos && Number.isFinite(pos.heading) ? pos.heading : null,
    live: true,
  };
}
