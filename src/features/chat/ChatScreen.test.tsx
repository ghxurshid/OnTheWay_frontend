import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ApiError } from '@/api/client';
import { i18nStore, t } from '@/i18n';
import { ChatScreen } from './ChatScreen';

const outbox = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  return {
    handlers,
    api: {
      on: (event: string, fn: (...args: unknown[]) => void) => { handlers.set(event, fn); return () => {}; },
      pendingFor: () => [],
      send: (toUserId: string, text: string) => ({ clientId: 'c1', toUserId, text, at: Date.now() }),
      retry: vi.fn(),
    },
  };
});
vi.mock('@/services/chatOutbox', () => ({ chatOutbox: outbox.api }));
vi.mock('@/services/realtime/chatClient', () => ({
  chatClient: { on: () => () => {}, onReconnected: () => () => {}, sendTyping: vi.fn() },
}));
vi.mock('@/services/realtime/presenceClient', () => ({
  presenceClient: { on: () => () => {}, isOnline: () => true },
}));
vi.mock('@/api/chatApi', () => ({
  chatApi: { withUser: async () => ({ items: [], hasNextPage: false }), markRead: async () => {} },
}));

const user = { id: '7', type: 'driver' as const, name: 'Aziz Karimov', initials: 'AK' };

async function mountAndSend() {
  await act(async () => { render(<ChatScreen user={user} onBack={vi.fn()} />); });
  fireEvent.change(screen.getByLabelText(t('chat.typeMessage')), { target: { value: 'Salom' } });
  fireEvent.click(screen.getByRole('button', { name: t('chat.send') }));
}

const failWith = (err: unknown, toUserId = '7') =>
  act(() => { outbox.handlers.get('failed')?.({ clientId: 'c1', toUserId, text: 'Salom', at: 0 }, err); });

beforeEach(() => { i18nStore.set('en'); outbox.api.retry.mockReset(); });
afterEach(cleanup);

describe('ChatScreen — a refused message', () => {
  it('says why (a block between the two) and marks the bubble failed', async () => {
    await mountAndSend();
    failWith(new ApiError(403, 'Blocked.', ['user_blocked']));
    expect(screen.getByRole('alert')).toHaveTextContent(t('errors.userBlocked'));
    expect(screen.getByText(t('chat.failed'))).toBeInTheDocument();
  });

  it('a refusal the hub reports reads the same', async () => {
    await mountAndSend();
    failWith(new Error("Failed to invoke 'SendMessage' due to an error on the server. HubException: user_blocked"));
    expect(screen.getByRole('alert')).toHaveTextContent(t('errors.userBlocked'));
  });

  it('never shows raw text for other refusals', async () => {
    await mountAndSend();
    failWith(new Error('weird backend text'));
    expect(screen.getByRole('alert')).toHaveTextContent(t('errors.sendFailed'));
  });

  it('ignores a failure in another conversation', async () => {
    await mountAndSend();
    failWith(new ApiError(403, 'Blocked.', ['user_blocked']), '8');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('the explanation goes away when resending', async () => {
    await mountAndSend();
    failWith(new ApiError(403, 'Blocked.', ['user_blocked']));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t('chat.resend')) }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(outbox.api.retry).toHaveBeenCalledWith('c1');
  });
});
