import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useToastQueue, TOAST_VISIBLE_MS, TOAST_EXIT_MS, TOAST_MAX_QUEUE } from './useToastQueue';

const notif = (title: string) => ({ title, body: title });

/** Run the full enter → hold → exit cycle of the toast currently on screen. */
const runCycle = (holdMs = TOAST_VISIBLE_MS) => {
  act(() => { vi.advanceTimersByTime(holdMs); });   // hold expires → exiting
  act(() => { vi.advanceTimersByTime(TOAST_EXIT_MS); }); // exit animation → advance
};

describe('useToastQueue', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('shows a pushed toast immediately', () => {
    const { result } = renderHook(() => useToastQueue());
    expect(result.current.current).toBeNull();

    act(() => { result.current.push(notif('a')); });
    expect(result.current.current?.title).toBe('a');
    expect(result.current.exiting).toBe(false);
  });

  it('auto-dismisses through an exit phase, then goes idle', () => {
    const { result } = renderHook(() => useToastQueue());
    act(() => { result.current.push(notif('a')); });

    act(() => { vi.advanceTimersByTime(TOAST_VISIBLE_MS); });
    // Still mounted, but now animating out — the component needs this frame to
    // play the slide-up rather than having the toast vanish instantly.
    expect(result.current.current?.title).toBe('a');
    expect(result.current.exiting).toBe(true);

    act(() => { vi.advanceTimersByTime(TOAST_EXIT_MS); });
    expect(result.current.current).toBeNull();
    expect(result.current.exiting).toBe(false);
  });

  it('queues back-to-back arrivals instead of replacing the visible one', () => {
    const { result } = renderHook(() => useToastQueue());
    act(() => {
      result.current.push(notif('first'));
      result.current.push(notif('second'));  // same tick — a burst of joins
    });
    expect(result.current.current?.title).toBe('first');

    runCycle();
    expect(result.current.current?.title).toBe('second');

    runCycle();
    expect(result.current.current).toBeNull();
  });

  it('honours a per-notification duration', () => {
    const { result } = renderHook(() => useToastQueue());
    act(() => { result.current.push({ ...notif('slow'), duration: 9000 }); });

    act(() => { vi.advanceTimersByTime(TOAST_VISIBLE_MS); });
    expect(result.current.exiting).toBe(false);   // still holding

    act(() => { vi.advanceTimersByTime(9000 - TOAST_VISIBLE_MS); });
    expect(result.current.exiting).toBe(true);
  });

  it('caps the backlog, keeping the most recent arrivals', () => {
    const { result } = renderHook(() => useToastQueue());
    act(() => {
      result.current.push(notif('showing'));
      // TOAST_MAX_QUEUE + 1 waiting → the oldest waiting one is dropped.
      for (let i = 1; i <= TOAST_MAX_QUEUE + 1; i++) result.current.push(notif(`q${i}`));
    });
    expect(result.current.current?.title).toBe('showing');

    runCycle();
    expect(result.current.current?.title).toBe('q2');   // q1 was dropped

    const seen: string[] = [];
    for (let i = 0; i < TOAST_MAX_QUEUE; i++) {
      if (result.current.current) seen.push(result.current.current.title);
      runCycle();
    }
    expect(seen).toEqual(['q2', 'q3', 'q4']);
    expect(result.current.current).toBeNull();
  });

  it('clear() drops the visible toast and the whole backlog', () => {
    const { result } = renderHook(() => useToastQueue());
    act(() => {
      result.current.push(notif('a'));
      result.current.push(notif('b'));
    });

    act(() => { result.current.clear(); });
    expect(result.current.current).toBeNull();

    // The backlog is gone too: nothing resurfaces on the next cycle.
    act(() => { vi.advanceTimersByTime(TOAST_VISIBLE_MS + TOAST_EXIT_MS); });
    expect(result.current.current).toBeNull();
  });

  it('leaves no timer running after unmount', () => {
    const { result, unmount } = renderHook(() => useToastQueue());
    act(() => { result.current.push(notif('a')); });
    expect(vi.getTimerCount()).toBeGreaterThan(0);   // hold timer is armed

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('leaves no timer running when unmounted mid-exit', () => {
    const { result, unmount } = renderHook(() => useToastQueue());
    act(() => { result.current.push(notif('a')); });
    act(() => { result.current.dismiss(); });        // exit timer armed
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
