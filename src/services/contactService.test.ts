import { describe, it, expect, vi, beforeEach } from 'vitest';

const api = vi.hoisted(() => ({ list: vi.fn(), add: vi.fn(), remove: vi.fn() }));
vi.mock('@/api/contactApi', () => ({ contactApi: api }));

const contact = (id: string) => ({ id, name: `User ${id}`, initials: 'U', type: 'driver', rating: null, phone: null,
  online: false, lastSeen: null, latlng: null, hasRoute: false });

/** Fresh module (the roster lives in it) + the error class of the same graph. */
async function load() {
  vi.resetModules();
  const svc = await import('./contactService');
  const { ApiError } = await import('@/api/client');
  return { ...svc, ApiError };
}

beforeEach(() => {
  api.list.mockReset().mockResolvedValue([contact('5')]);
  api.add.mockReset().mockResolvedValue({});
  api.remove.mockReset().mockResolvedValue(true);
});

describe('contact roster', () => {
  it('knows a contact the moment it is added — and when it is removed', async () => {
    const { listContacts, addContact, removeContact, contactRoster } = await load();
    await listContacts();
    expect(contactRoster.has('5')).toBe(true);

    await expect(addContact('7')).resolves.toBe('added');
    expect(contactRoster.has(7)).toBe(true);

    await removeContact('7');
    expect(contactRoster.has('7')).toBe(false);
    expect(contactRoster.has('5')).toBe(true);
  });

  it('does not ask the server again for someone already in it (no 409 to log)', async () => {
    const { listContacts, addContact } = await load();
    await listContacts();
    await expect(addContact('5')).resolves.toBe('already');
    expect(api.add).not.toHaveBeenCalled();
  });

  it('a 409 means already added', async () => {
    const { addContact, contactRoster, ApiError } = await load();
    api.add.mockRejectedValueOnce(new ApiError(409, 'exists'));
    await expect(addContact('8')).resolves.toBe('already');
    expect(contactRoster.has('8')).toBe(true);
  });

  it('a failed add changes nothing', async () => {
    const { addContact, contactRoster, ApiError } = await load();
    api.add.mockRejectedValueOnce(new ApiError(0, 'offline', [], 'network'));
    await expect(addContact('9')).rejects.toBeInstanceOf(ApiError);
    expect(contactRoster.has('9')).toBe(false);
  });

  it('the roster id list is stable between changes (a store snapshot)', async () => {
    const { listContacts, contactRoster } = await load();
    await listContacts();
    expect(contactRoster.ids()).toBe(contactRoster.ids());
  });
});
