import { describe, expect, it } from 'vitest';
import { NO_WATERMARKS, displayStatus, furtherStatus, idAtMost, raiseWatermark, statusFromServer } from './messageStatus';

describe('messageStatus', () => {
  it('compares long ids as numbers, not as text', () => {
    expect(idAtMost('9', '10')).toBe(true);
    expect(idAtMost('10', '9')).toBe(false);
    expect(idAtMost('12345678901234567', '12345678901234568')).toBe(true); // beyond Number precision
    expect(idAtMost('7', '7')).toBe(true);
  });

  it('never puts a local (unsent) message under a watermark', () => {
    expect(idAtMost('local-3', '99')).toBe(false);
    expect(idAtMost('5', null)).toBe(false);
  });

  it('reads the status from the server receipt times', () => {
    expect(statusFromServer({})).toBe('sent');
    expect(statusFromServer({ deliveredAtUtc: '2026-09-25T08:00:00Z' })).toBe('delivered');
    expect(statusFromServer({ deliveredAtUtc: '2026-09-25T08:00:00Z', readAtUtc: '2026-09-25T08:01:00Z' })).toBe('read');
    expect(statusFromServer({ isRead: true })).toBe('read');
  });

  it('only moves forward', () => {
    expect(furtherStatus('read', 'delivered')).toBe('read');
    expect(furtherStatus('sent', 'delivered')).toBe('delivered');
    expect(furtherStatus('pending', 'sent')).toBe('sent');
    expect(furtherStatus('delivered', 'failed')).toBe('delivered');
  });

  it('ignores an older receipt', () => {
    const w = raiseWatermark(NO_WATERMARKS, 'read', '20');
    expect(raiseWatermark(w, 'read', '15')).toBe(w);
    expect(raiseWatermark(w, 'read', '21').read).toBe('21');
  });

  it('lifts my messages covered by a receipt, and only those', () => {
    const w = { delivered: '12', read: '10' };
    expect(displayStatus('9', 'sent', w)).toBe('read');
    expect(displayStatus('11', 'sent', w)).toBe('delivered');
    expect(displayStatus('13', 'sent', w)).toBe('sent');
    expect(displayStatus('11', 'read', w)).toBe('read'); // server already knew better
    expect(displayStatus('local-1', 'pending', w)).toBe('pending');
    expect(displayStatus('8', 'failed', w)).toBe('failed');
  });
});
