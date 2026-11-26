import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { i18nStore, t } from '@/i18n';
import type { RideOfferState } from '@/hooks/useCallSession';
import { CallScreen } from './CallScreen';

const peer = { name: 'Ali Karimov', initials: 'AK', type: 'driver' as const };

/** An answered call with the ride offer standing at `offer`; the call screen covers the app. */
function inCall(offer: RideOfferState) {
  const onOffer = vi.fn();
  const onRespondOffer = vi.fn();
  render(<CallScreen callee={peer} phase="active" offer={offer} onOffer={onOffer} onRespondOffer={onRespondOffer} live />);
  return { dialog: screen.getByRole('dialog'), onOffer, onRespondOffer };
}

beforeEach(() => { i18nStore.set('en'); });
afterEach(cleanup);

describe('CallScreen — why the offer button is back', () => {
  it('says on the call screen itself that the offer is no longer valid, and lets either side offer again', () => {
    const { dialog, onOffer } = inCall('expired');

    expect(within(dialog).getByRole('status')).toHaveTextContent(t('call.offerExpired'));
    fireEvent.click(within(dialog).getByRole('button', { name: new RegExp(t('call.agreeBtn')) }));
    expect(onOffer).toHaveBeenCalledTimes(1);
  });

  it('says the other person declined, and nothing when no offer was made', () => {
    inCall('declined');
    expect(screen.getByRole('status')).toHaveTextContent(t('call.offerDeclined', { name: 'Ali' }));
    cleanup();

    inCall('none');
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('button', { name: new RegExp(t('call.agreeBtn')) })).toBeInTheDocument();
  });

  it('says why the offer failed — it could not be sent, the agreement did not come — and lets them offer again', () => {
    const { dialog, onOffer } = inCall({ failed: t('errors.realtimeOffline') });
    expect(within(dialog).getByRole('status')).toHaveTextContent(t('errors.realtimeOffline'));
    fireEvent.click(within(dialog).getByRole('button', { name: new RegExp(t('call.agreeBtn')) }));
    expect(onOffer).toHaveBeenCalledTimes(1);
    cleanup();

    inCall({ failed: t('call.offerUnconfirmed') });
    expect(screen.getByRole('status')).toHaveTextContent(t('call.offerUnconfirmed'));
  });
});

describe('CallScreen — an offer made to me', () => {
  it('an accept that did not get through says so, and both answers stay to tap again', () => {
    const { dialog, onRespondOffer } = inCall('unsent');

    expect(within(dialog).getByRole('status')).toHaveTextContent(t('call.offerUnsent'));
    fireEvent.click(within(dialog).getByRole('button', { name: t('call.offerAccept') }));
    expect(onRespondOffer).toHaveBeenCalledWith(true);
    expect(within(dialog).getByRole('button', { name: t('call.offerDecline') })).toBeInTheDocument();
    cleanup();

    inCall('received');
    expect(screen.getByRole('status')).not.toHaveTextContent(t('call.offerUnsent'));
  });
});
