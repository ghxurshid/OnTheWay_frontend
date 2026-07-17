import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { useEscapeKey } from './useEscapeKey';

function Harness({ handler, active }: { handler: () => void; active?: boolean }) {
  useEscapeKey(handler, active);
  return null;
}

function pressEscape() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
}

describe('useEscapeKey', () => {
  it('calls the handler on Escape', () => {
    const handler = vi.fn();
    render(<Harness handler={handler} active />);
    pressEscape();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('ignores other keys', () => {
    const handler = vi.fn();
    render(<Harness handler={handler} active />);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(handler).not.toHaveBeenCalled();
  });

  it('does nothing when inactive', () => {
    const handler = vi.fn();
    render(<Harness handler={handler} active={false} />);
    pressEscape();
    expect(handler).not.toHaveBeenCalled();
  });

  it('detaches the listener on unmount', () => {
    const handler = vi.fn();
    const { unmount } = render(<Harness handler={handler} active />);
    unmount();
    pressEscape();
    expect(handler).not.toHaveBeenCalled();
  });
});
