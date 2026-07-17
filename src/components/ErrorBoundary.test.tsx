import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

function Boom(): never {
  throw new Error('kaboom');
}

afterEach(() => vi.restoreAllMocks());

describe('ErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    render(<ErrorBoundary><div>safe content</div></ErrorBoundary>);
    expect(screen.getByText('safe content')).toBeInTheDocument();
  });

  it('shows the recoverable fallback when a child throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {}); // silence React's error log
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('invokes onReset when the retry button is pressed', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onReset = vi.fn();
    render(<ErrorBoundary onReset={onReset}><Boom /></ErrorBoundary>);
    fireEvent.click(screen.getByRole('button'));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
