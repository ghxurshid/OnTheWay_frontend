/* ════════════════════════════════════════════════════════════════
   useBootstrap — one-time auth + realtime + session-restore boot.
   ────────────────────────────────────────────────────────────────
   Owns the readiness flags (auth / session) and the boot error, plus
   the retained-session snapshot, my open trips (GET /trips/mine — a
   published plan waits there, not in the session) and the contacts
   list. The app reads
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
import { chatOutbox } from '@/services/chatOutbox';
import { tripOutbox } from '@/services/tripOutbox';
import { readOpenTrips } from '@/services/tripResume';
import type { OpenTrips } from '@/services/tripResume';
import { CONTACTS_EVENT, contactRoster, listContacts } from '@/services/contactService';
import { blockStore } from '@/services/blockStore';
import { syncProfileMirror } from '@/services/profileService';
import { settingsService } from '@/services/settingsService';
import { initTelegramUi } from '@/services/telegram';

export function useBootstrap() {
  const [authReady, setAuthReady] = useState(USE_MOCKS);     // mock mode needs no auth
  const [sessionReady, setSessionReady] = useState(USE_MOCKS); // server snapshot fetched (or failed)
  const [authError, setAuthError] = useState<unknown>(null); // kept as thrown, so the screen can localize it
  const [bootNonce, setBootNonce] = useState(0);
  const bootRef = useRef(false);
  const restoredSessionRef = useRef<any>(null); // server session snapshot fetched on boot
  const openTripsRef = useRef<OpenTrips | null>(null); // my open trips as of this boot (null in demo mode)
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
        // Read alongside the realtime connect and the session restore (never rejects).
        const openTrips = readOpenTrips();
        await connectRealtime();
        // Whatever the last session could not deliver (offline, app closed):
        // the messages written and the trips closed / banded.
        chatOutbox.flush();
        tripOutbox.flush();
        // Restore the retained session (role, free mode, engaged, active trip)
        // so a reopened app resumes its pre-close state.
        restoredSessionRef.current = await walkerStateStore.restoreFromServer();
        openTripsRef.current = await openTrips;
        setSessionReady(true); // splash may proceed (and possibly auto-resume)
      } catch (e) {
        setAuthError(e ?? new Error('Boot failed'));
      }
    })();
  }, [bootNonce]);

  // Contacts loaded once authenticated; the ref follows the roster (an add or a
  // remove refreshes it — see contactService).
  useEffect(() => {
    if (!authReady) return undefined;
    const sync = () => { contactsRef.current = contactRoster.list(); };
    window.addEventListener(CONTACTS_EVENT, sync);
    listContacts().catch(() => {});
    return () => window.removeEventListener(CONTACTS_EVENT, sync);
  }, [authReady]);

  // Server-owned data mirrored locally, refreshed once signed in: the block list
  // (so blocked people stay hidden on this device too), my car (create-trip seats,
  // the drawer, the "add your car" hint) and my settings (language, theme, the
  // switches that gate toasts — right on a new device before Settings is opened).
  // Best-effort — the cached copies stay when offline. Demo mode keeps them local.
  useEffect(() => {
    if (!authReady || USE_MOCKS) return;
    blockStore.hydrate().catch(() => {});
    syncProfileMirror().catch(() => {});
    settingsService.sync().catch(() => {});
  }, [authReady]);

  // Re-arm the boot sequence after a failure (the auth-error retry button).
  const retry = useCallback(() => {
    setAuthError(null);
    bootRef.current = false;
    setBootNonce((n) => n + 1);
  }, []);

  return { authReady, sessionReady, authError, restoredSessionRef, openTripsRef, contactsRef, retry };
}
