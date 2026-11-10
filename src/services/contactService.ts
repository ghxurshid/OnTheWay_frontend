/* SERVICE — contacts business logic, and the roster: the address book as this
   session knows it, so "Add to contacts" disappears the moment someone is
   added (and comes back when removed) without a reload. Announces
   CONTACTS_EVENT; React reads it through `useStoreEvent`. */

import { ApiError, USE_MOCKS } from '@/api/client';
import { contactApi } from '@/api/contactApi';
import { walkerApi } from '@/api/walkerApi';
import { isConflict } from '@/utils/errors';
import { idOf, isRealUserId } from '@/utils/ids';
import { notifyStoreChange } from '@/utils/storage';
import type { Contact } from '@/models';

export const CONTACTS_EVENT = 'ontheway:contacts';

let contacts: Contact[] = [];
let ids: string[] = []; // stable between changes (useStoreEvent snapshot)
/** Added this session: kept even when a list that was already on its way comes back without them. */
const added = new Set<string>();

const setRoster = (next: Contact[]): void => {
  contacts = next;
  ids = [...new Set([...next.map((c) => idOf(c.id)), ...added])];
  notifyStoreChange(CONTACTS_EVENT);
};

export const contactRoster = {
  /** The contacts as last loaded. */
  list: (): Contact[] => contacts,
  /** Their user ids (also of someone added this session, before a reload). */
  ids: (): string[] => ids,
  has: (userId: string | number): boolean => ids.includes(idOf(userId)),
};

/** Fetch all contacts (and refresh the roster). */
export async function listContacts(): Promise<Contact[]> {
  const list = await contactApi.list() as Contact[];
  setRoster(list || []);
  return list;
}

/** Save another user as a contact. Resolves 'already' when they were one — known
    from the roster without asking, or from the server's 409. */
export async function addContact(contactUserId: string): Promise<'added' | 'already'> {
  const id = idOf(contactUserId);
  if (contactRoster.has(id)) return 'already';
  try {
    await contactApi.add(id);
  } catch (e) {
    if (!isConflict(e)) throw e;
    added.add(id);
    setRoster(contacts);
    return 'already';
  }
  added.add(id);
  setRoster(contacts);
  listContacts().catch(() => { /* the id is known already; names come with the next load */ });
  return 'added';
}

/** Remove a user from the caller's contacts (affects only the owner's list). */
export async function removeContact(contactUserId: string): Promise<unknown> {
  const id = idOf(contactUserId);
  const result = await contactApi.remove(id);
  added.delete(id);
  setRoster(contacts.filter((c) => idOf(c.id) !== id));
  return result;
}

/** Of these people, the ones the server no longer shows me: a block either way
    (the side that was blocked has no other way to know) or a closed account —
    their public profile answers 404 / nothing. Offline or any other failure
    says nothing, so the caller keeps showing them. Demo mode: none. */
export async function unavailablePeople(userIds: string[]): Promise<Set<string>> {
  if (USE_MOCKS) return new Set();
  const ids = [...new Set(userIds.map(idOf))].filter(isRealUserId);
  const gone = await Promise.all(ids.map(async (id) => {
    try {
      return (await walkerApi.profile(id)) ? null : id;
    } catch (e) {
      return e instanceof ApiError && e.status === 404 ? id : null;
    }
  }));
  return new Set(gone.filter((id): id is string => !!id));
}

/** Split contacts into online / offline buckets (presentation grouping). */
export function groupByPresence(contacts: Contact[]) {
  return {
    online: contacts.filter((c) => c.online),
    offline: contacts.filter((c) => !c.online),
  };
}
