import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { i18nStore, t } from '@/i18n';
import { agreementStore } from '@/services/agreementStore';
import { AgreedRideCard } from './AgreedRideCard';

const dto = (arrivedBy: string[]) => ({
  id: 'a1', peer: { userId: '7', name: 'Aziz Karimov', type: 'driver' }, status: 'agreed', arrivedBy, version: arrivedBy.length + 1,
});

const mount = () => render(
  <AgreedRideCard mode="passenger" userLoc={null} locate={() => null}
    onCall={vi.fn()} onChat={vi.fn()} onArrived={vi.fn()} onCancel={vi.fn()} />,
);

beforeEach(() => { i18nStore.set('en'); agreementStore.reset(); });
afterEach(() => { cleanup(); act(() => agreementStore.reset()); });

describe('AgreedRideCard', () => {
  it('says nothing about arrival while nobody has arrived', () => {
    agreementStore.hydrate([dto([])]);
    mount();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows the other person reaching the pick-up, live', () => {
    agreementStore.hydrate([dto([])]);
    mount();
    act(() => { agreementStore.upsert(dto(['7'])); });
    expect(screen.getByRole('status')).toHaveTextContent(t('agree.peerArrived', { name: 'Aziz' }));
    expect(screen.getByRole('button', { name: t('agree.arrivedBtn') })).toBeInTheDocument(); // I am still on my way
  });

  it('shows both when both have arrived', () => {
    agreementStore.hydrate([dto(['7', '9'])]);
    mount();
    const lines = screen.getAllByRole('status').map((el) => el.textContent);
    expect(lines).toEqual([expect.stringContaining(t('agree.peerArrived', { name: 'Aziz' })), expect.stringContaining(t('agree.arrivedSent', { name: 'Aziz' }))]);
  });
});
