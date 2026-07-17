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

export interface AuthSession {
  accessToken: string;
  accessTokenExpiresAt?: string;
  refreshToken?: string;
  user?: unknown;
}

type Refresher = () => Promise<AuthSession>;

let session: AuthSession | null = load();
let refresher: Refresher | null = null; // registered by authService
let inflight: Promise<AuthSession> | null = null; // single-flight refresh promise

function load(): AuthSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function persist(): void {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable — keep the in-memory session only */
  }
}

export const authStore = {
  /** Replace the whole session (after login / refresh). */
  set(next: AuthSession | null) {
    session = next || null;
    persist();
  },

  clear() {
    session = null;
    persist();
  },

  get(): AuthSession | null {
    return session;
  },

  getAccessToken(): string | null {
    return session?.accessToken || null;
  },

  getRefreshToken(): string | null {
    return session?.refreshToken || null;
  },

  getUser(): unknown {
    return session?.user || null;
  },

  isAuthenticated(): boolean {
    return !!session?.accessToken;
  },

  /** True when the access token is missing or within `skewMs` of expiry. */
  isAccessTokenExpired(skewMs = 30_000): boolean {
    if (!session?.accessTokenExpiresAt) return !session?.accessToken;
    return new Date(session.accessTokenExpiresAt).getTime() - Date.now() <= skewMs;
  },

  /** authService injects the concrete refresh implementation here. */
  setRefresher(fn: Refresher) {
    refresher = fn;
  },

  /**
   * Obtain a fresh session. Concurrent callers share one in-flight request so
   * a burst of 401s triggers a single /auth/refresh round-trip.
   */
  async refresh(): Promise<AuthSession> {
    if (!refresher) throw new Error('No refresher registered');
    if (!inflight) {
      inflight = Promise.resolve()
        .then(refresher)
        .finally(() => { inflight = null; });
    }
    return inflight;
  },
};
