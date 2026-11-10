import { describe, it, expect, afterEach } from 'vitest';
import { mainButton } from './telegram';

const setWebApp = (webApp: unknown) => { (window as unknown as { Telegram?: unknown }).Telegram = webApp ? { WebApp: webApp } : undefined; };
afterEach(() => setWebApp(null));

describe('mainButton', () => {
  const MainButton = { show: () => {} };

  it('is null when the SDK is loaded in a plain browser (no launch data): the in-page buttons show', () => {
    setWebApp({ initData: '', MainButton });
    expect(mainButton()).toBeNull();
  });

  it('is the native button inside Telegram', () => {
    setWebApp({ initData: 'query_id=1&user=%7B%7D&hash=x', MainButton });
    expect(mainButton()).toBe(MainButton);
  });

  it('is null without the SDK', () => {
    expect(mainButton()).toBeNull();
  });
});
