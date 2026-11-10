import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetIfAccountChanged } from './accountGuard';

const openedBy = (id: number | null) => {
  (globalThis as Record<string, unknown>).Telegram = id == null ? undefined : { WebApp: { initDataUnsafe: { user: { id } } } };
};

describe('account guard', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('otw-lang', 'uz');
    localStorage.setItem('otw-theme', 'dark');
    localStorage.setItem('ontheway_chat_outbox_v1', '[{"text":"A’s message"}]');
    localStorage.setItem('otw-blocked', '["9"]');
    localStorage.setItem('unrelated', 'kept');
  });
  afterEach(() => openedBy(null));

  it('wipes the previous account’s data when another Telegram user opens the app', () => {
    localStorage.setItem('otw-session', JSON.stringify({ accessToken: 't', telegramUserId: '111' }));
    openedBy(222);
    expect(resetIfAccountChanged()).toBe(true);
    expect(localStorage.getItem('otw-session')).toBeNull();
    expect(localStorage.getItem('ontheway_chat_outbox_v1')).toBeNull();
    expect(localStorage.getItem('otw-blocked')).toBeNull();
    // Device preferences and foreign keys stay.
    expect(localStorage.getItem('otw-lang')).toBe('uz');
    expect(localStorage.getItem('otw-theme')).toBe('dark');
    expect(localStorage.getItem('unrelated')).toBe('kept');
  });

  it('keeps everything for the same user', () => {
    localStorage.setItem('otw-session', JSON.stringify({ accessToken: 't', telegramUserId: '111' }));
    openedBy(111);
    expect(resetIfAccountChanged()).toBe(false);
    expect(localStorage.getItem('ontheway_chat_outbox_v1')).not.toBeNull();
  });

  it('keeps an older session that never recorded its user (no mass wipe on upgrade)', () => {
    localStorage.setItem('otw-session', JSON.stringify({ accessToken: 't' }));
    openedBy(222);
    expect(resetIfAccountChanged()).toBe(false);
    expect(localStorage.getItem('otw-session')).not.toBeNull();
  });

  it('does nothing outside Telegram or without a session', () => {
    localStorage.setItem('otw-session', JSON.stringify({ accessToken: 't', telegramUserId: '111' }));
    openedBy(null);
    expect(resetIfAccountChanged()).toBe(false);
    localStorage.removeItem('otw-session');
    openedBy(222);
    expect(resetIfAccountChanged()).toBe(false);
  });

  it('survives a corrupt session value', () => {
    localStorage.setItem('otw-session', '{not json');
    openedBy(222);
    expect(resetIfAccountChanged()).toBe(false);
  });
});
