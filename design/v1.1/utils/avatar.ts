/* Avatar helpers shared by live walkers, the demo simulation and the call/chat
   cards — one palette and one initials rule for every person on screen. */

export const AVATAR_PALETTE = [
  '#1fc8c0', '#f0a832', '#a78bfa', '#ff5c72', '#2ecc8e',
  '#4d9fff', '#ff8a4d', '#e85ad6', '#5fd0e0', '#ffd24d',
];

/** Up to two upper-case initials ("Aziz Karimov" → "AK"); 👤 when unnamed. */
export function initialsOf(name?: string | null): string {
  const words = (name || '').trim().split(/\s+/).filter(Boolean);
  return words.length ? words.map((w) => w[0]).join('').slice(0, 2).toUpperCase() : '👤';
}

/** Stable colour per id (a walker keeps the same colour across ticks). */
export function colorForId(id: string | number): string {
  const s = String(id ?? '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}
