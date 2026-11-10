import { describe, it, expect, vi, beforeEach } from 'vitest';

const api = vi.hoisted(() => ({ me: vi.fn(), updateVehicle: vi.fn() }));
vi.mock('@/api/userApi', () => ({ userApi: api }));

const CAR = { model: 'Chevrolet Cobalt', color: 'oq', plate: '01A777BB', seats: 3 };

/** Fresh modules (prefs are read from storage on import). */
async function load() {
  vi.resetModules();
  const svc = await import('./profileService');
  const { prefsStore } = await import('./prefsStore');
  return { ...svc, prefsStore };
}

beforeEach(() => {
  localStorage.clear();
  api.me.mockReset();
  api.updateVehicle.mockReset();
});

describe('profile service — the car', () => {
  it('mirrors the server car into prefs', async () => {
    const { loadMyProfile, prefsStore } = await load();
    api.me.mockResolvedValue({ id: '1', vehicle: 'Chevrolet Cobalt · oq · 01A777BB', vehicleInfo: { ...CAR, plate: '01a777bb' }, ratingAverage: 4.5, ratingCount: 2 });
    const me = await loadMyProfile();
    expect(me).toMatchObject({ ratingAverage: 4.5, ratingCount: 2, vehicle: CAR });
    expect(prefsStore.get().vehicle).toEqual(CAR);
  });

  it('a car cleared on the server clears the mirror; a legacy one-line car keeps the local copy', async () => {
    const { loadMyProfile, prefsStore } = await load();
    prefsStore.patch({ vehicle: CAR });
    api.me.mockResolvedValueOnce({ id: '1', vehicle: 'Cobalt', vehicleInfo: null });
    await loadMyProfile();
    expect(prefsStore.get().vehicle).toEqual(CAR);

    api.me.mockResolvedValueOnce({ id: '1', vehicle: null, vehicleInfo: null });
    await loadMyProfile();
    expect(prefsStore.get().vehicle).toBeNull();
  });

  it('a slow load that started before a save does not bring the old car back', async () => {
    const { loadMyProfile, saveVehicle, prefsStore } = await load();
    let answer!: (me: unknown) => void;
    api.me.mockReturnValueOnce(new Promise((res) => { answer = res; }));
    const loading = loadMyProfile();
    api.updateVehicle.mockResolvedValueOnce({ vehicle: 'x', vehicleInfo: CAR });
    await saveVehicle(CAR);
    answer({ id: '1', vehicle: null, vehicleInfo: null }); // read before the save landed
    await expect(loading).resolves.toMatchObject({ vehicle: CAR });
    expect(prefsStore.get().vehicle).toEqual(CAR);
  });

  it('a load during a save in flight does not undo it either', async () => {
    const { loadMyProfile, saveVehicle, prefsStore } = await load();
    let saved!: (r: unknown) => void;
    api.updateVehicle.mockReturnValueOnce(new Promise((res) => { saved = res; }));
    const saving = saveVehicle(CAR);
    api.me.mockResolvedValueOnce({ id: '1', vehicle: null, vehicleInfo: null });
    const loading = loadMyProfile();
    saved({ vehicle: 'x', vehicleInfo: CAR });
    await saving;
    await loading;
    expect(prefsStore.get().vehicle).toEqual(CAR);
  });

  it('a load after the save follows the server again', async () => {
    const { loadMyProfile, saveVehicle, prefsStore } = await load();
    api.updateVehicle.mockResolvedValueOnce({ vehicle: 'x', vehicleInfo: CAR });
    await saveVehicle(CAR);
    api.me.mockResolvedValueOnce({ id: '1', vehicle: null, vehicleInfo: null }); // cleared on another device
    await loadMyProfile();
    expect(prefsStore.get().vehicle).toBeNull();
  });

  it('saves the structured car and mirrors it only once the server accepted it', async () => {
    const { saveVehicle, prefsStore } = await load();
    api.updateVehicle.mockRejectedValueOnce(new Error('offline'));
    await expect(saveVehicle(CAR)).rejects.toThrow('offline');
    expect(prefsStore.get().vehicle).toBeNull();

    api.updateVehicle.mockResolvedValueOnce({ vehicle: 'x', vehicleInfo: CAR });
    await expect(saveVehicle(CAR)).resolves.toEqual(CAR);
    expect(api.updateVehicle).toHaveBeenLastCalledWith(CAR);
    expect(prefsStore.get().vehicle).toEqual(CAR);
  });
});
