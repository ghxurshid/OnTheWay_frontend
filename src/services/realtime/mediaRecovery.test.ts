import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMediaRecovery, DISCONNECTED_GRACE_MS, RECOVERY_WINDOW_MS } from './mediaRecovery';

function setup(canRestart = true) {
  const restart = vi.fn();
  const giveUp = vi.fn();
  const allow = { value: canRestart };
  const recovery = createMediaRecovery({ canRestart: () => allow.value, restart, giveUp });
  return { recovery, restart, giveUp, allow };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('call media recovery', () => {
  it('lets a brief "disconnected" heal by itself', () => {
    const { recovery, restart, giveUp } = setup();

    recovery.onState('disconnected');
    vi.advanceTimersByTime(DISCONNECTED_GRACE_MS - 1);
    recovery.onState('connected');
    vi.advanceTimersByTime(RECOVERY_WINDOW_MS);

    expect(restart).not.toHaveBeenCalled();
    expect(giveUp).not.toHaveBeenCalled();
  });

  it('restarts ICE when "disconnected" outlasts the grace, and at once on "failed"', () => {
    const { recovery, restart } = setup();

    recovery.onState('disconnected');
    vi.advanceTimersByTime(DISCONNECTED_GRACE_MS);
    expect(restart).toHaveBeenCalledTimes(1);

    recovery.onState('failed');
    expect(restart).toHaveBeenCalledTimes(2);
  });

  it('gives the call up when the media does not return in time', () => {
    const { recovery, giveUp } = setup();

    recovery.onState('failed');
    vi.advanceTimersByTime(RECOVERY_WINDOW_MS);

    expect(giveUp).toHaveBeenCalledTimes(1);
  });

  it('the callee (or a side without signaling) waits; a restart follows once signaling is back', () => {
    const { recovery, restart, allow } = setup(false);

    recovery.onState('failed');
    expect(restart).not.toHaveBeenCalled();

    allow.value = true;
    recovery.retry('failed');
    expect(restart).toHaveBeenCalledTimes(1);

    recovery.retry('connected');
    expect(restart).toHaveBeenCalledTimes(1);
  });

  it('dispose cancels everything pending', () => {
    const { recovery, restart, giveUp } = setup();

    recovery.onState('disconnected');
    recovery.dispose();
    vi.advanceTimersByTime(RECOVERY_WINDOW_MS);

    expect(restart).not.toHaveBeenCalled();
    expect(giveUp).not.toHaveBeenCalled();
  });
});
