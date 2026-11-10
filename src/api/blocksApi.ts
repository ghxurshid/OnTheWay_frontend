/* REPOSITORY — blocked users (/blocks). A block is server-side and works both
   ways: the two people stop seeing each other on the map, lists and board, and
   cannot chat or call. The list is the people *I* blocked; unblocking is
   always possible. Both writes are idempotent. */

import { USE_MOCKS, mockResponse, http, send } from './client';
import { idOf } from '@/utils/ids';

/** One person I blocked (newest first in a list). */
export interface BlockedUser {
  userId: string;
  name: string;
  photoUrl: string | null;
  /** ISO instant. */
  blockedAt: string;
}

interface BlockedUserRow { userId?: unknown; name?: string | null; photoUrl?: string | null; blockedAt?: string | null }

/** Normalise a server row: ids are strings on the frontend. */
export const toBlockedUser = (r: BlockedUserRow | null | undefined, fallbackId = ''): BlockedUser => ({
  userId: idOf(r?.userId ?? fallbackId),
  name: r?.name || '',
  photoUrl: r?.photoUrl || null,
  blockedAt: r?.blockedAt || new Date().toISOString(),
});

// Demo mode: the "server" list for this session.
const MOCK_BLOCKS = new Map<string, BlockedUser>();

export const blocksApi = {
  /** GET /blocks — the people I blocked, newest first. */
  list(): Promise<BlockedUser[]> {
    if (USE_MOCKS) return mockResponse([...MOCK_BLOCKS.values()].sort((a, b) => b.blockedAt.localeCompare(a.blockedAt)));
    return http<BlockedUserRow[]>('/blocks').then((rows) => (rows || []).map((r) => toBlockedUser(r)));
  },

  /** PUT /blocks/{userId} — block (idempotent); returns the row. */
  block(userId: string): Promise<BlockedUser> {
    const id = idOf(userId);
    if (USE_MOCKS) {
      const row = MOCK_BLOCKS.get(id) || toBlockedUser({ userId: id });
      MOCK_BLOCKS.set(id, row);
      return mockResponse(row);
    }
    return send<BlockedUserRow>('PUT', `/blocks/${encodeURIComponent(id)}`).then((r) => toBlockedUser(r, id));
  },

  /** DELETE /blocks/{userId} — unblock (idempotent). */
  unblock(userId: string): Promise<void> {
    const id = idOf(userId);
    if (USE_MOCKS) {
      MOCK_BLOCKS.delete(id);
      return mockResponse(undefined);
    }
    return send('DELETE', `/blocks/${encodeURIComponent(id)}`).then(() => undefined);
  },
};
