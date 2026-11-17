/* Call-user converters — pure mappers from the various user shapes (scheduled
   walker, saved contact, incoming CallHub invite) to the compact "call user"
   card the call/chat UI expects. Kept dependency-light so both App and the
   call-session hook can share them. */

import { t } from '@/i18n';
import { initialsOf } from '@/utils/avatar';
import { personIdOf } from '@/utils/ids';
import type { LatLng } from '@/utils/geo';
import type { PushNotif } from '@/models';

type PartyType = 'driver' | 'passenger';

/** The compact card the call/chat UI renders. */
export interface CallUser {
  id: string;
  type: PartyType;
  initials: string;
  name: string;
  sub: string;
  rating?: number;
  latlng?: LatLng;
  photoUrl?: string | null;
}

interface WalkerLike {
  /** A planned-board walker: the trip id (the person is `userId`). */
  id: string;
  /** The trip owner, on planned-board walkers. */
  userId?: string;
  type: PartyType; initials: string; name: string;
  vehicle?: string | null; seats?: number | null; rating?: number | null; fromLatlng?: LatLng; photoUrl?: string | null;
}
interface ContactLike {
  id: string; type: PartyType; initials: string; name: string;
  vehicle?: string; rating?: number | null; latlng?: LatLng | null;
}
interface CallInvite {
  fromUserId: string | number;
  caller?: { name?: string; kind?: string; username?: string; vehicle?: string; rating?: number; photoUrl?: string | null } | null;
}

/** A scheduled/simulated walker → call-user card. The card is the PERSON: a
    planned-board walker's trip owner (`userId`), never its trip id. */
export const walkerToCallUser = (w: WalkerLike): CallUser => ({
  id: personIdOf(w), type: w.type, initials: w.initials, name: w.name,
  sub: w.type === 'driver' ? (w.vehicle || t('common.driver')) : t('common.passenger'),
  rating: w.rating ?? undefined, latlng: w.fromLatlng,
});

/** A saved contact → call-user card. */
export const contactToUser = (c: ContactLike): CallUser => ({
  id: c.id, type: c.type, initials: c.initials, name: c.name,
  sub: c.type === 'driver' ? (c.vehicle || t('common.driver')) : t('common.passenger'),
  rating: c.rating ?? undefined, latlng: c.latlng ?? undefined,
});

/** Resolve the incoming caller's display card: the real profile carried in the
    invite wins; a live walker already on the map (`liveWalkers` Map) or a saved
    contact (`contacts` array) is the fallback. */
export const inviteToCallUser = (
  invite: CallInvite,
  liveWalkers: Map<string, WalkerLike>,
  contacts: ContactLike[],
): CallUser => {
  const id = String(invite.fromUserId);
  const p = invite.caller;
  if (p && p.name) {
    const type: PartyType = p.kind === 'driver' ? 'driver' : 'passenger';
    return {
      id, type, initials: initialsOf(p.name), name: p.name,
      sub: p.username ? `@${p.username}`
        : (type === 'driver' ? (p.vehicle || t('common.driver')) : t('common.passenger')),
      rating: p.rating, photoUrl: p.photoUrl || null,
    };
  }
  const w = liveWalkers.get(id);
  if (w) {
    return {
      id, type: w.type, initials: w.initials, name: w.name,
      sub: w.type === 'driver' ? (w.vehicle || t('common.driver')) : t('common.passenger'),
      rating: w.rating ?? undefined, photoUrl: w.photoUrl || null,
    };
  }
  const c = contacts.find((x) => String(x.id) === id);
  return c ? contactToUser(c)
    : { id, type: 'passenger', initials: '👤', name: t('call.unknownCaller'), sub: '' };
};

/** The toast for a callee who looks offline. Nobody can answer a closed app:
    suggest a message instead (the backend also pings them through the
    Telegram bot) — unless I blocked them, when a message would be refused
    too. (A block made by THEM is invisible to this client.) Both are the
    answer to the user's own tap: shown even while the chat it came from closes. */
export function offlineNotice(user: CallUser, blockedByMe: boolean): PushNotif {
  if (blockedByMe) return { title: t('call.failedTitle'), body: t('errors.userBlocked'), priority: 'high' };
  return {
    title: t('call.offlineTitle', { name: (user.name || '').split(' ')[0] }),
    body: t('call.offlineBody'),
    user,
    chat: true,
    action: t('common.chat'),
    priority: 'high',
  };
}
