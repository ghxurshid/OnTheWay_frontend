import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ApiError } from '@/api/client';

const hub = vi.hoisted(() => ({ sendMessage: vi.fn(), onReconnected: vi.fn() }));
const rest = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@/services/realtime/chatClient', () => ({ chatClient: hub }));
vi.mock('@/api/chatApi', () => ({ chatApi: rest }));

// Errors come from the same (fresh) module graph as the outbox, or instanceof fails.
let Api: typeof ApiError;
const offline = () => new Api(0, 'Network request failed.', [], 'network');
const saved = (clientMessageId: string) => ({ id: '42', senderId: '1', content: 'Salom', clientMessageId });
const tick = () => new Promise((r) => setTimeout(r, 0));

async function load() {
  vi.resetModules();
  Api = (await import('@/api/client')).ApiError;
  return (await import('./chatOutbox')).chatOutbox;
}

beforeEach(() => {
  localStorage.clear();
  hub.sendMessage.mockReset();
  rest.send.mockReset();
});

describe('chat outbox', () => {
  it('sends over the socket and reports the stored message', async () => {
    hub.sendMessage.mockImplementation(async (_to, _text, id) => saved(id));
    const outbox = await load();
    const settled = vi.fn();
    outbox.on('settled', settled);

    const item = outbox.send('7', 'Salom');
    await tick();

    expect(hub.sendMessage).toHaveBeenCalledWith('7', 'Salom', item.clientId);
    expect(settled).toHaveBeenCalledWith(item, saved(item.clientId));
    expect(outbox.pendingFor('7')).toEqual([]);
  });

  it('falls back to REST with the SAME id, so a lost socket answer cannot double the message', async () => {
    hub.sendMessage.mockRejectedValue(new Error('Invocation canceled: connection closed'));
    rest.send.mockImplementation(async (_to, _text, id) => saved(id));
    const outbox = await load();

    const item = outbox.send('7', 'Salom');
    await tick();

    expect(rest.send).toHaveBeenCalledWith('7', 'Salom', item.clientId);
    expect(outbox.pendingFor('7')).toEqual([]);
  });

  it('keeps a message written offline — even across a restart — and sends it once when back', async () => {
    let outbox = await load();
    hub.sendMessage.mockRejectedValue(new Error('Chat hub not connected'));
    rest.send.mockRejectedValue(offline());
    const item = outbox.send('7', 'Yo`ldaman');
    await tick();
    expect(outbox.pendingFor('7')).toMatchObject([{ clientId: item.clientId, text: 'Yo`ldaman' }]);

    outbox = await load(); // chat closed, app reopened
    hub.sendMessage.mockImplementation(async (_to, _text, id) => saved(id));
    await outbox.flush();

    expect(hub.sendMessage).toHaveBeenLastCalledWith('7', 'Yo`ldaman', item.clientId);
    expect(outbox.pendingFor('7')).toEqual([]);
  });

  it('a refusal is shown as failed and can be resent under the same id', async () => {
    hub.sendMessage.mockRejectedValue(new Error('Chat hub not connected'));
    const outbox = await load();
    rest.send.mockRejectedValueOnce(new Api(400, 'Validation failed'));
    const failed = vi.fn();
    outbox.on('failed', failed);

    const item = outbox.send('7', 'Salom');
    await tick();
    expect(failed).toHaveBeenCalledWith(item);
    await outbox.flush(); // refused messages wait for the user's "resend"
    expect(rest.send).toHaveBeenCalledTimes(1);

    rest.send.mockImplementation(async (_to, _text, id) => saved(id));
    outbox.retry(item.clientId);
    await tick();
    expect(rest.send).toHaveBeenLastCalledWith('7', 'Salom', item.clientId);
    expect(outbox.pendingFor('7')).toEqual([]);
  });

  it('a conflict means a racing attempt stored it already: settled', async () => {
    hub.sendMessage.mockRejectedValue(new Error('Chat hub not connected'));
    const outbox = await load();
    rest.send.mockRejectedValue(new Api(409, 'Duplicate'));
    const settled = vi.fn();
    outbox.on('settled', settled);

    const item = outbox.send('7', 'Salom');
    await tick();

    expect(settled).toHaveBeenCalledWith(item, null);
    expect(outbox.pendingFor('7')).toEqual([]);
  });
});
