import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { i18nStore } from '@/i18n';

const walkers = vi.hoisted(() => ({ profile: vi.fn() }));
vi.mock('@/api/walkerApi', () => ({ walkerApi: walkers }));
vi.mock('@/hooks/useContacts', () => ({
  useContacts: () => ({ contacts: [], loading: false, error: null, reload: () => {} }),
}));

const partner = { id: 'partner-7', type: 'partner', label: 'Aziza Karimova', initials: 'AK', userId: '7', partyType: 'driver' };

/** Fresh stores + component (blockStore reads its cache on import). */
async function mount() {
  vi.resetModules();
  const { ContactsPanel } = await import('./ContactsPanel');
  await act(async () => { render(<ContactsPanel onSelect={() => {}} onOpenChat={() => {}} />); });
}

beforeEach(() => {
  localStorage.clear();
  i18nStore.set('en');
  localStorage.setItem('ontheway_saved_v1', JSON.stringify([partner]));
  walkers.profile.mockReset().mockResolvedValue({ id: '7', name: 'Aziza Karimova' });
});

/** The error the fresh module graph's client throws (instanceof must match). */
const apiError = async (status: number) => {
  const { ApiError } = await import('@/api/client');
  return new ApiError(status, 'x', [], status === 0 ? 'network' : undefined);
};
afterEach(cleanup);

describe('Contacts → Favourites', () => {
  it('shows a saved partner', async () => {
    await mount();
    expect(screen.getByText('Aziza')).toBeInTheDocument();
  });

  // E2E 2026-11-06: an agreement saves the partner as a favourite; blocking them left it in place.
  it('leaves out someone I blocked', async () => {
    localStorage.setItem('otw-blocked', JSON.stringify([{ userId: '7', name: 'Aziza Karimova', photoUrl: null, blockedAt: '2026-11-06T08:00:00Z' }]));
    await mount();
    expect(screen.queryByText('Aziza')).toBeNull();
  });

  it('leaves out someone who blocked me (their profile is gone: 404), without deleting the favourite', async () => {
    walkers.profile.mockImplementation(async () => { throw await apiError(404); });
    await mount();
    expect(screen.queryByText('Aziza')).toBeNull();
    expect(JSON.parse(localStorage.getItem('ontheway_saved_v1') || '[]')).toHaveLength(1);
  });

  it('keeps them listed while offline', async () => {
    walkers.profile.mockImplementation(async () => { throw await apiError(0); });
    await mount();
    expect(screen.getByText('Aziza')).toBeInTheDocument();
  });
});
