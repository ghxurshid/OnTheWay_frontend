import { describe, it, expect, beforeEach } from 'vitest';
import { i18nStore } from '@/i18n';
import { walkerToCallUser } from './callUser';
import { personIdOf } from './ids';

beforeEach(() => i18nStore.set('en'));

const boardWalker = { id: '501', userId: '42', type: 'driver' as const, initials: 'AK', name: 'Aziz Karimov',
  vehicle: 'Cobalt · oq · 01A777BB', rating: 4.8, fromLatlng: [41.3, 69.24] as [number, number] };

describe('walkerToCallUser', () => {
  it('a planned-board walker is called / chatted as its trip owner, not the trip id', () => {
    const u = walkerToCallUser(boardWalker);
    expect(u).toMatchObject({ id: '42', type: 'driver', name: 'Aziz Karimov', sub: 'Cobalt · oq · 01A777BB', rating: 4.8 });
    expect(u.id).not.toBe(boardWalker.id);
  });

  it('a walker without userId (live / demo) keeps its own id', () => {
    expect(walkerToCallUser({ ...boardWalker, id: 'sim_3', userId: undefined }).id).toBe('sim_3');
    expect(walkerToCallUser({ ...boardWalker, userId: '' }).id).toBe('501');
  });
});

describe('personIdOf', () => {
  it('prefers the owner and always returns a string', () => {
    expect(personIdOf({ id: 501, userId: 42 })).toBe('42');
    expect(personIdOf({ id: 7 })).toBe('7');
  });
});
