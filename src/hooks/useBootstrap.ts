/* ════════════════════════════════════════════════════════════════
   useBootstrap — one-time auth + realtime + session-restore boot.
   ────────────────────────────────────────────────────────────────
   Owns the readiness flags (auth / session) and the boot error, plus
   the retained-session snapshot and the contacts list. The app reads
   these to drive its splash → home/map routing; the hook itself makes
   no routing decisions.

   Mock mode short-circuits the whole flow (ready flags start true).
   `retry()` re-arms the boot sequence after a failure.
   ════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef, useCallback } from 'react';
import { USE_MOCKS } from '@/api/client';
import { ensureAuth } from '@/services/authService';
import { connectRealtime } from '@/services/realtime';
import { walkerStateStore } from '@/services/walkerStateStore';
import { listContacts } from '@/services/contactService';
import { initTelegramUi } from '@/services/telegram';

export function useBootstrap() {
  const [authReady, setAuthReady] = useState(USE_MOCKS);     // mock mode needs no auth
  const [sessionReady, setSessionReady] = useState(USE_MOCKS); // server snapshot fetched (or failed)
  const [authError, setAuthError] = useState<string | null>(null);
  const [bootNonce, setBootNonce] = useState(0);
  const bootRef = useRef(false);
  const restoredSessionRef = useRef<any>(null); // server session snapshot fetched on boot
  const contactsRef = useRef<any[]>([]);        // address book (used by the push-message sim)

  // One-time auth + realtime bootstrap (skipped entirely in mock mode).
  useEffect(() => {
    initTelegramUi();
    if (USE_MOCKS || bootRef.current) return;
    bootRef.current = true;
    (async () => {
      try {
        await ensureAuth();
        setAuthReady(true);
        await connectRealtime();
        // Restore the retained session (role, free mode, engaged, active trip)
        // so a reopened app resumes its pre-close state.
        restoredSessionRef.current = await walkerStateStore.restoreFromServer();
        setSessionReady(true); // splash may proceed (and possibly auto-resume)
      } catch (e) {
        setAuthError((e as Error)?.message || String(e));
      }
    })();
  }, [bootNonce]);

  // Contacts loaded once authenticated.
  useEffect(() => {
    if (!authReady) return;
    listContacts().then((c) => { contactsRef.current = c; }).catch(() => {});
  }, [authReady]);

  // Re-arm the boot sequence after a failure (the auth-error retry button).
  const retry = useCallback(() => {
    setAuthError(null);
    bootRef.current = false;
    setBootNonce((n) => n + 1);
  }, []);

  return { authReady, sessionReady, authError, restoredSessionRef, contactsRef, retry };
}
