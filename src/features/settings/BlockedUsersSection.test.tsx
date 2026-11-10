import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent, cleanup } from '@testing-library/react';
import { i18nStore, t } from '@/i18n';

const api = vi.hoisted(() => ({ list: vi.fn(), block: vi.fn(), unblock: vi.fn() }));
vi.mock('@/api/blocksApi', () => ({ blocksApi: api }));

const row = (userId: string, name: string) => ({ userId, name, photoUrl: null, blockedAt: '2026-11-05T10:00:00Z' });

/** Click and let the request it starts settle (state updates inside act). */
const press = (el: HTMLElement) => act(async () => { fireEvent.click(el); });

/** Fresh store + component (the store reads its cache on import). */
async function mount() {
  vi.resetModules();
  const { BlockedUsersSection } = await import('./BlockedUsersSection');
  await act(async () => { render(<BlockedUsersSection />); });
}

beforeEach(() => {
  localStorage.clear();
  i18nStore.set('en');
  Object.values(api).forEach((fn) => fn.mockReset());
  api.unblock.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('Settings → Blocked users', () => {
  it('loads the list from the server and unblocks', async () => {
    let answer!: (rows: unknown[]) => void;
    api.list.mockReturnValue(new Promise((res) => { answer = res; }));
    await mount();
    expect(screen.getByText(t('common.loading'))).toBeInTheDocument();
    await act(async () => { answer([row('7', 'Aziz Karimov')]); });

    await press(await screen.findByRole('button', { name: `${t('blocks.unblock')}: Aziz Karimov` }));
    expect(api.unblock).toHaveBeenCalledWith('7');
    expect(await screen.findByText(t('blocks.emptyTitle'))).toBeInTheDocument();
  });

  it('says why an unblock failed and keeps the person listed', async () => {
    api.list.mockResolvedValue([row('7', 'Aziz Karimov')]);
    api.unblock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await mount();
    await press(await screen.findByRole('button', { name: `${t('blocks.unblock')}: Aziz Karimov` }));
    expect(await screen.findByRole('alert')).toHaveTextContent(t('blocks.unblockFailed'));
    expect(screen.getByText('Aziz Karimov')).toBeInTheDocument();
  });

  it('shows a retryable error when the list cannot be loaded', async () => {
    api.list.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce([]);
    await mount();
    await press(await screen.findByRole('button', { name: t('common.retry') }));
    expect(await screen.findByText(t('blocks.emptyTitle'))).toBeInTheDocument();
  });
});
