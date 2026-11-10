import { describe, it, expect, vi, beforeEach } from 'vitest';

// The chat hub behind a fake connection, so "connected / dropped mid-send" can be played.
const fake = vi.hoisted(() => ({ connection: null as null | { invoke: ReturnType<typeof vi.fn> } }));
vi.mock('./hubConnection', () => ({
  createEmitter: () => ({ on: () => () => {}, emit: () => {} }),
  createHubClient: () => ({
    connected: () => fake.connection,
    connect: () => Promise.resolve(),
    disconnect: () => Promise.resolve(),
    isConnected: () => !!fake.connection,
    onReconnected: () => () => {},
  }),
}));

import { chatClient } from './chatClient';

beforeEach(() => { fake.connection = { invoke: vi.fn() }; });

describe('chat client — typing', () => {
  it('sends nothing while the socket is down', async () => {
    const conn = fake.connection!;
    fake.connection = null;

    await expect(chatClient.sendTyping('7', true)).resolves.toBeUndefined();
    expect(conn.invoke).not.toHaveBeenCalled();
  });

  it('a send that fails (the socket dropping mid-way) is swallowed, never an error per key', async () => {
    fake.connection!.invoke.mockRejectedValue(new Error('Invocation canceled due to the underlying connection being closed.'));

    await expect(chatClient.sendTyping('7', true)).resolves.toBeUndefined();
    expect(fake.connection!.invoke).toHaveBeenCalledWith('SendTyping', '7', true);
  });
});
