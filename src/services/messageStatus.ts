/* SERVICE — chat receipt state: 🕓 sending · ✓ sent · ✓✓ delivered · ✓✓ read.
   Watermark model (Telegram's read_outbox_max_id, XMPP chat markers): a receipt
   says "everything up to message N", so a screen keeps two ids per conversation
   instead of patching every bubble, and a status only ever moves forward.
   Server ids are numeric strings (longs — never Number()); local ids of messages
   still in flight never fall under a watermark. */

export type MessageStatus = 'pending' | 'failed' | 'sent' | 'delivered' | 'read';

/** Highest id of my messages the other side has received / read (null = none yet). */
export interface Watermarks { delivered: string | null; read: string | null }

export const NO_WATERMARKS: Watermarks = { delivered: null, read: null };

/** Server-confirmed states in the order they happen. */
const PROGRESS: Record<'sent' | 'delivered' | 'read', number> = { sent: 1, delivered: 2, read: 3 };
const NUMERIC_ID = /^\d+$/;

/** id ≤ upTo for numeric-string ids; false for local ids or no watermark. */
export function idAtMost(id: string, upTo: string | null): boolean {
  if (upTo == null || !NUMERIC_ID.test(id) || !NUMERIC_ID.test(upTo)) return false;
  return id.length !== upTo.length ? id.length < upTo.length : id <= upTo;
}

/** Status of a persisted message, from the receipt times the server keeps. */
export function statusFromServer(m: { isRead?: boolean; deliveredAtUtc?: string | null; readAtUtc?: string | null }): MessageStatus {
  if (m.readAtUtc || m.isRead) return 'read';
  return m.deliveredAtUtc ? 'delivered' : 'sent';
}

/** The further of two statuses. In-flight states (pending/failed) always yield
    to a server-confirmed one; confirmed states never move backwards. */
export function furtherStatus(a: MessageStatus, b: MessageStatus): MessageStatus {
  if (a === 'pending' || a === 'failed') return b;
  if (b === 'pending' || b === 'failed') return a;
  return PROGRESS[b] > PROGRESS[a] ? b : a;
}

/** Move one watermark up to `upTo`; an older receipt leaves it unchanged. */
export function raiseWatermark(w: Watermarks, kind: keyof Watermarks, upTo: string): Watermarks {
  return idAtMost(upTo, w[kind]) ? w : { ...w, [kind]: upTo };
}

/** What one of my messages shows: its own status, lifted by the receipts. */
export function displayStatus(id: string, status: MessageStatus, w: Watermarks): MessageStatus {
  if (status === 'pending' || status === 'failed') return status;
  if (idAtMost(id, w.read)) return 'read';
  if (idAtMost(id, w.delivered)) return furtherStatus(status, 'delivered');
  return status;
}
