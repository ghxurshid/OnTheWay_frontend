import { describe, it, expect, vi } from 'vitest';
import { backDepth, pushBack } from './backStack';
import { confirmAction, confirmStore } from './confirm';

const pressEscape = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

describe('back stack', () => {
  it('closes only the top-most layer, one per press', () => {
    const drawer = vi.fn();
    const dialog = vi.fn();
    const popDrawer = pushBack(drawer);
    const popDialog = pushBack(dialog);

    pressEscape();
    expect(dialog).toHaveBeenCalledTimes(1);
    expect(drawer).not.toHaveBeenCalled();

    popDialog();
    pressEscape();
    expect(drawer).toHaveBeenCalledTimes(1);

    popDrawer();
    expect(backDepth()).toBe(0);
  });
});

describe('confirmAction', () => {
  it('resolves with the user\'s answer', async () => {
    const answer = confirmAction({ title: 'End trip?', confirmLabel: 'End' });
    expect(confirmStore.get()?.title).toBe('End trip?');
    confirmStore.settle(true);
    await expect(answer).resolves.toBe(true);
    expect(confirmStore.get()).toBeNull();
  });

  it('a newer question cancels an unanswered one', async () => {
    const first = confirmAction({ title: 'A', confirmLabel: 'ok' });
    const second = confirmAction({ title: 'B', confirmLabel: 'ok' });
    await expect(first).resolves.toBe(false);
    confirmStore.settle(false);
    await expect(second).resolves.toBe(false);
  });
});
