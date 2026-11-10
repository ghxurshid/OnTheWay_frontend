import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SeatsField } from './SeatsField';

afterEach(cleanup);

describe('SeatsField', () => {
  it('offers 1–4 for an ordinary car', () => {
    render(<SeatsField value="3" onChange={vi.fn()} />);
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['1', '2', '3', '4']);
  });

  it('a bigger car keeps its own number selected, and available after choosing another', () => {
    const onChange = vi.fn();
    const { rerender } = render(<SeatsField value="6" onChange={onChange} />);
    expect(screen.getByRole('button', { name: '6' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    expect(onChange).toHaveBeenCalledWith('2');
    rerender(<SeatsField value="2" onChange={onChange} />);
    expect(screen.getByRole('button', { name: '6' })).toHaveAttribute('aria-pressed', 'false');
  });
});
