import { afterEach, describe, expect, it } from 'vitest';
import { parseDeepLink, resetDeepLinkForTests, takeDeepLink } from './deepLink';

const launchAt = (url: string) => window.history.replaceState(null, '', url);

describe('deepLink', () => {
  afterEach(() => {
    resetDeepLinkForTests();
    launchAt('/');
  });

  it('understands the bot links and ignores anything else', () => {
    expect(parseDeepLink('chat_12345')).toEqual({ kind: 'chat', userId: '12345' });
    expect(parseDeepLink('trips')).toEqual({ kind: 'trips' });
    expect(parseDeepLink('chat_abc')).toBeNull();
    expect(parseDeepLink('chat_1; drop')).toBeNull();
    expect(parseDeepLink('')).toBeNull();
    expect(parseDeepLink(null)).toBeNull();
  });

  it('reads ?startapp from the Mini App URL once and cleans it, keeping Telegram data', () => {
    launchAt('/app?startapp=chat_77&x=1#tgWebAppData=abc');

    expect(takeDeepLink()).toEqual({ kind: 'chat', userId: '77' });
    expect(window.location.search).toBe('?x=1');
    expect(window.location.hash).toBe('#tgWebAppData=abc');
    expect(takeDeepLink()).toBeNull(); // once per launch
  });

  it('also reads the tgWebAppStartParam Telegram adds to direct links', () => {
    launchAt('/?tgWebAppStartParam=trips');

    expect(takeDeepLink()).toEqual({ kind: 'trips' });
  });
});
