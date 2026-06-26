/* ════════════════════════════════════════════════════════════════
   AUTH STORE — the single source of truth for the JWT session.
   ────────────────────────────────────────────────────────────────
   Deliberately dependency-free (imports nothing from api/ or services/)
   so both the HTTP client and the auth service can lean on it without a
   circular import. The actual "how do we get a fresh token" logic is
   injected by authService via `setRefresher`, keeping this module pure
   persistence + a single-flight refresh guard.
   ════════════════════════════════════════════════════════════════ */

const STORAGE_KEY = 'otw-session';

let session = load(); // { accessToken, accessTokenExpiresAt, refreshToken, user } | null
let refresher = null; // async () => session, registered by authService
let inflight = null; // single-flight refresh promise

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function persist() {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable — keep the in-memory session only */
  }
}

export const authStore = {
  /** Replace the whole session (after login / refresh). */
  set(next) {
    session = next || null;
    persist();
  },

  clear() {
    session = null;
    persist();
  },

  get() {
    return session;
  },

  getAccessToken() {
    return session?.accessToken || null;
  },

  getRefreshToken() {
    return session?.refreshToken || null;
  },

  getUser() {
    return session?.user || null;
  },

  isAuthenticated() {
    return !!session?.accessToken;
  },

  /** True when the access token is missing or within `skewMs` of expiry. */
  isAccessTokenExpired(skewMs = 30_000) {
    if (!session?.accessTokenExpiresAt) return !session?.accessToken;
    return new Date(session.accessTokenExpiresAt).getTime() - Date.now() <= skewMs;
  },

  /** authService injects the concrete refresh implementation here. */
  setRefresher(fn) {
    refresher = fn;
  },

  /**
   * Obtain a fresh session. Concurrent callers share one in-flight request so
   * a burst of 401s triggers a single /auth/refresh round-trip.
   */
  async refresh() {
    if (!refresher) throw new Error('No refresher registered');
    if (!inflight) {
      inflight = Promise.resolve()
        .then(refresher)
        .finally(() => { inflight = null; });
    }
    return inflight;
  },
};
