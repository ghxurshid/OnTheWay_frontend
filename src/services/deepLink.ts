/* SERVICE — deep links into a screen, e.g. the Telegram bot's "open in the app"
   buttons on a chat notification or a trip reminder. The value comes from the
   launch's start parameter (services/telegram getStartParam). A link is taken
   once per launch, and removed from the URL so a reload does not reopen it. */

import { START_PARAM_KEYS, getStartParam } from '@/services/telegram';

export type DeepLink =
  | { kind: 'chat'; userId: string }   // chat_<userId>
  | { kind: 'trips' };                 // trips — "My trips"

const CHAT_LINK = /^chat_(\d+)$/;

/** Reads a start parameter; anything unknown is ignored (null). */
export function parseDeepLink(value: string | null | undefined): DeepLink | null {
  const raw = (value ?? '').trim();
  if (raw === 'trips') return { kind: 'trips' };
  const chat = CHAT_LINK.exec(raw);
  return chat ? { kind: 'chat', userId: chat[1] } : null;
}

let taken = false;

/** This launch's deep link — the first call only; null afterwards or when there is none. */
export function takeDeepLink(): DeepLink | null {
  if (taken) return null;
  taken = true;
  const link = parseDeepLink(getStartParam());
  if (link) forgetStartParam();
  return link;
}

/** Test hook: behave as a fresh launch. */
export function resetDeepLinkForTests(): void {
  taken = false;
}

// Only our query keys go; Telegram's #tgWebAppData hash stays untouched.
function forgetStartParam(): void {
  try {
    const url = new URL(window.location.href);
    START_PARAM_KEYS.forEach((key) => url.searchParams.delete(key));
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  } catch {
    /* no history API (tests, very old WebViews): harmless */
  }
}
