/* Call-user converters — pure mappers from the various user shapes (scheduled
   walker, saved contact, incoming CallHub invite) to the compact "call user"
   card the call/chat UI expects. Kept dependency-light so both App and the
   call-session hook can share them. */

import { t } from '@/i18n';
import { initialsOf } from '@/services/liveWalkers';

/** A scheduled/simulated walker → call-user card. */
export const walkerToCallUser = (w) => ({
  id: w.id, type: w.type, initials: w.initials, name: w.name,
  sub: w.type === 'driver' ? `${w.vehicle} · ${w.seats} ${t('common.seats')}` : t('common.passenger'),
  rating: w.rating, latlng: w.fromLatlng,
});

/** A saved contact → call-user card. */
export const contactToUser = (c) => ({
  id: c.id, type: c.type, initials: c.initials, name: c.name,
  sub: c.type === 'driver' ? (c.vehicle || t('common.driver')) : t('common.passenger'),
  rating: c.rating, latlng: c.latlng,
});

/** Resolve the incoming caller's display card: the real profile carried in the
    invite wins; a live walker already on the map (`liveWalkers` Map) or a saved
    contact (`contacts` array) is the fallback. */
export const inviteToCallUser = (invite, liveWalkers, contacts) => {
  const id = String(invite.fromUserId);
  const p = invite.caller;
  if (p && p.name) {
    const type = p.kind === 'driver' ? 'driver' : 'passenger';
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
      rating: w.rating, photoUrl: w.photoUrl || null,
    };
  }
  const c = contacts.find((x) => String(x.id) === id);
  return c ? contactToUser(c)
    : { id, type: 'passenger', initials: '👤', name: t('call.unknownCaller') };
};
