import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { i18nStore, t } from '@/i18n';
import type { MyProfile } from '@/services/profileService';
import { ProfileScreen } from './ProfileScreen';

const service = vi.hoisted(() => ({ loadMyProfile: vi.fn(), saveVehicle: vi.fn() }));
vi.mock('@/services/profileService', () => service);
const confirm = vi.hoisted(() => ({ confirmAction: vi.fn() }));
vi.mock('@/services/confirm', () => confirm);

const profile = (color: string, seats: number): MyProfile => ({
  ratingAverage: 0, ratingCount: 0, vehicle: { model: 'Chevrolet Cobalt', color, plate: '01A777BB', seats },
});

const mount = async (me: MyProfile) => {
  service.loadMyProfile.mockResolvedValue(me);
  await act(async () => { render(<ProfileScreen mode="driver" onClose={vi.fn()} />); });
};
const pressed = (name: string) => screen.getByRole('button', { name }).getAttribute('aria-pressed');

beforeEach(() => { localStorage.clear(); service.saveVehicle.mockReset(); });
afterEach(cleanup);

describe('ProfileScreen — removing the car', () => {
  it('asks, then clears it on the server and empties the form', async () => {
    i18nStore.set('en');
    const { prefsStore } = await import('@/services/prefsStore');
    prefsStore.patch({ vehicle: { model: 'Chevrolet Cobalt', color: 'white', plate: '01A777BB', seats: 3 } });
    confirm.confirmAction.mockResolvedValueOnce(true);
    service.saveVehicle.mockImplementationOnce(async () => { prefsStore.patch({ vehicle: null }); return null; });
    await mount(profile('white', 3));

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: t('profile.removeCar') })); });

    expect(confirm.confirmAction).toHaveBeenCalledWith(expect.objectContaining({ danger: true }));
    expect(service.saveVehicle).toHaveBeenCalledWith(null);
    expect(screen.getByLabelText(t('profile.model'))).toHaveValue('');
    expect(screen.queryByRole('button', { name: t('profile.removeCar') })).toBeNull();
  });

  it('cancelled: nothing changes', async () => {
    i18nStore.set('en');
    const { prefsStore } = await import('@/services/prefsStore');
    prefsStore.patch({ vehicle: { model: 'Chevrolet Cobalt', color: 'white', plate: '01A777BB', seats: 3 } });
    confirm.confirmAction.mockResolvedValueOnce(false);
    await mount(profile('white', 3));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: t('profile.removeCar') })); });
    expect(service.saveVehicle).not.toHaveBeenCalled();
  });

  it('no car, no button', async () => {
    i18nStore.set('en');
    const { prefsStore } = await import('@/services/prefsStore');
    prefsStore.patch({ vehicle: null });
    await mount({ ratingAverage: 0, ratingCount: 0, vehicle: null });
    expect(screen.queryByRole('button', { name: t('profile.removeCar') })).toBeNull();
  });
});

describe('ProfileScreen', () => {
  it('a colour saved in another language still highlights its chip', async () => {
    i18nStore.set('ru');
    await mount(profile('oq', 3)); // saved while the app was in Uzbek
    expect(pressed(t('profile.colorWhite'))).toBe('true');
    expect(pressed(t('profile.colorBlack'))).toBe('false');
  });

  it('a colour no chip knows just selects nothing', async () => {
    i18nStore.set('en');
    await mount(profile('pink', 3));
    expect(screen.getAllByRole('button', { pressed: true }).map((b) => b.textContent)).toEqual(['3']);
  });

  it('seats above 4 show as an extra selected chip, kept while choosing', async () => {
    i18nStore.set('en');
    await mount(profile('white', 6));
    expect(pressed('6')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    expect(pressed('2')).toBe('true');
    expect(pressed('6')).toBe('false'); // can still go back to it
  });

  it('no extra chip for an ordinary car', async () => {
    i18nStore.set('en');
    await mount(profile('white', 4));
    expect(screen.queryByRole('button', { name: '5' })).toBeNull();
    expect(pressed('4')).toBe('true');
  });
});
