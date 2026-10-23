import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ProctorIndicator } from './ProctorIndicator';

afterEach(cleanup);

describe('ProctorIndicator', () => {
  it('shows nothing when no device is in use', () => {
    const { container } = render(<ProctorIndicator camera={null} mic={null} flags={null} />);
    expect(container.textContent).toBe('');
  });

  it('shows which devices are on', () => {
    render(<ProctorIndicator camera="ready" mic="ready" flags={null} />);
    expect(screen.getByText('Camera on')).toBeTruthy();
    expect(screen.getByText('Mic on')).toBeTruthy();
  });

  it('shows only the device the host turned on', () => {
    render(<ProctorIndicator camera={null} mic="ready" flags={null} />);
    expect(screen.queryByText(/Camera/)).toBeNull();
    expect(screen.getByText('Mic on')).toBeTruthy();
  });

  it.each(['denied', 'missing', 'lost'] as const)('says a %s device is unavailable', (state) => {
    render(<ProctorIndicator camera={state} mic={null} flags={null} />);
    expect(screen.getByText('Camera unavailable')).toBeTruthy();
  });

  it('counts flags only when the host set a limit', () => {
    const { rerender } = render(
      <ProctorIndicator camera="ready" mic={null} flags={{ count: 2, limit: 10 }} />,
    );
    expect(screen.getByText('Flags 2 of 10')).toBeTruthy();
    rerender(<ProctorIndicator camera="ready" mic={null} flags={{ count: 2, limit: null }} />);
    expect(screen.queryByText(/Flags/)).toBeNull();
  });
});
