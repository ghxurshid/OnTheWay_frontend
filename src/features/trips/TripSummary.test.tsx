import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { i18nStore, t } from '@/i18n';
import { TripSummary } from './TripSummary';

const partner = { id: '7', name: 'Aziz Karimov', initials: 'AK', type: 'driver' as const };

beforeEach(() => i18nStore.set('en'));
afterEach(cleanup);

describe('TripSummary', () => {
  it('rates once, however many ways the screen is left in one frame', () => {
    const onRate = vi.fn();
    const onDone = vi.fn();
    const onAgain = vi.fn();
    render(<TripSummary distanceKm={5} durationMin={12} partner={partner} onRate={onRate} onAgain={onAgain} onDone={onDone} />);

    fireEvent.click(screen.getByRole('radio', { name: '4 ★' }));
    const done = screen.getByRole('button', { name: t('summary.done') });
    fireEvent.click(done);
    fireEvent.click(done);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t('summary.again')) }));

    expect(onRate).toHaveBeenCalledTimes(1);
    expect(onRate).toHaveBeenCalledWith(4, []);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onAgain).not.toHaveBeenCalled();
  });

  it('leaving without stars sends no rating', () => {
    const onRate = vi.fn();
    render(<TripSummary distanceKm={5} durationMin={12} partner={partner} onRate={onRate} onAgain={vi.fn()} onDone={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: t('summary.done') }));
    expect(onRate).not.toHaveBeenCalled();
  });
});
