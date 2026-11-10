/* ════════════════════════════════════════════════════════════════
   The presence state this device WANTS the server to hold: search role,
   whether (and where) it shares its location, "band", the route it shares
   and the routes it watches. Every presence command records itself here
   before it is sent, so nothing is lost when it is sent while offline, and
   after any (re)connect `replay()` lists the calls that rebuild exactly this
   state on the fresh connection. The server treats them idempotently and
   only broadcasts real changes, so replaying is always safe.
   A field the app has not decided yet stays `undefined` and is not replayed
   (the server keeps what it retained, e.g. across an app restart).
   ════════════════════════════════════════════════════════════════ */

export interface LocationFix { lat: number; lng: number; heading: number | null }

/** A hub invocation: method name + arguments. */
export type HubCall = [method: string, ...args: unknown[]];

export function createPresenceState() {
  let mode: string | null = null;
  let engaged: boolean | undefined;
  let sharing: boolean | undefined;
  let lastFix: LocationFix | null = null;
  let route: unknown | null | undefined; // null = explicitly cleared
  const watched = new Set<string>();
  const unwatched = new Set<string>(); // the server remembers watches across reconnects

  return {
    get mode() { return mode; },
    setMode(role: string | null) { mode = role || null; },
    setEngaged(value: boolean) { engaged = value; },
    /** A position was reported — the walker shares their location. */
    located(fix: LocationFix) { sharing = true; lastFix = fix; },
    stopSharing() { sharing = false; lastFix = null; },
    setRoute(dto: unknown | null) { route = dto; },
    watch(walkerId: string) { watched.add(walkerId); unwatched.delete(walkerId); },
    unwatch(walkerId: string) { watched.delete(walkerId); unwatched.add(walkerId); },

    /** The calls that re-create this state on a new connection, in a safe order:
        the role first (joins the audience group, seeds the map); "band" before
        the position, so a banded walker never flashes onto others' maps; the
        route before the position, so it is sent along when the walker appears. */
    replay(): HubCall[] {
      const calls: HubCall[] = [];
      if (mode) calls.push(['SetRole', mode]);
      if (engaged !== undefined) calls.push([engaged ? 'MarkEngaged' : 'MarkAvailable']);
      if (route === null) calls.push(['ClearRoute']);
      else if (route !== undefined) calls.push(['PublishRoute', route]);
      if (sharing === false) calls.push(['StopSharing']);
      else if (sharing && lastFix) calls.push(['UpdateLocation', lastFix.lat, lastFix.lng, lastFix.heading]);
      watched.forEach((id) => calls.push(['WatchRoute', id]));
      unwatched.forEach((id) => calls.push(['UnwatchRoute', id]));
      return calls;
    },
  };
}

export type PresenceState = ReturnType<typeof createPresenceState>;
