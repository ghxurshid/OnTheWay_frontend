/* localStorage JSON helpers. Storage can be unavailable (private mode, quota,
   sandboxed WebView), so every access degrades to the fallback / a no-op. */

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Persists `value` (removes the key for null/undefined). */
export function writeJson(key: string, value: unknown): void {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — keep the in-memory value only */
  }
}

/** Tells same-tab subscribers (see `useStoreEvent`) that a store changed. */
export const notifyStoreChange = (event: string): void => {
  window.dispatchEvent(new Event(event));
};
