/* ════════════════════════════════════════════════════════════════
   BACK STACK — one "go back" for the whole app.
   Every overlay (chat, panel, drawer, sheet, dialog) registers a close
   handler while it is open. The top-most one runs when the user presses
   Telegram's native Back button (shown only while something is open) or
   Escape on a keyboard — so "back" closes the current layer instead of
   the whole Mini App, and one key press never closes two layers at once.
   ════════════════════════════════════════════════════════════════ */

import { webApp } from './telegram';

interface Entry { id: number; handler: () => void }

const stack: Entry[] = [];
let seq = 0;
let wired = false;

const goBack = () => { stack[stack.length - 1]?.handler(); };

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && stack.length) { e.preventDefault(); goBack(); }
}

function wire() {
  if (wired || typeof window === 'undefined') return;
  wired = true;
  window.addEventListener('keydown', onKey);
  try { webApp()?.BackButton?.onClick?.(goBack); } catch { /* not in Telegram */ }
}

function syncButton() {
  const button = webApp()?.BackButton;
  try { if (stack.length) button?.show?.(); else button?.hide?.(); } catch { /* not in Telegram */ }
}

/** Register a back handler; returns the function that removes it. */
export function pushBack(handler: () => void): () => void {
  wire();
  const id = ++seq;
  stack.push({ id, handler });
  syncButton();
  return () => {
    const i = stack.findIndex((e) => e.id === id);
    if (i >= 0) stack.splice(i, 1);
    syncButton();
  };
}

/** Number of open layers (for tests / diagnostics). */
export const backDepth = (): number => stack.length;
