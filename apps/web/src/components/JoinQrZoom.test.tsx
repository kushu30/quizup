import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { JoinQrZoom } from './JoinQrZoom';

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
});

const URL = 'https://quizup.kushu30.me/join/K7M2QX';

function renderZoom() {
  return render(<JoinQrZoom url={URL} code="K7M2QX" />);
}

describe('JoinQrZoom', () => {
  it('shows the QR as a button that offers a full-screen view', () => {
    renderZoom();
    const trigger = screen.getByRole('button', { name: 'Show the join QR code full screen' });
    expect(within(trigger).getByRole('img', { name: `QR code for ${URL}` })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens a full-screen view with a big QR, the join code and the link', () => {
    renderZoom();
    fireEvent.click(screen.getByRole('button', { name: 'Show the join QR code full screen' }));
    const dialog = screen.getByRole('dialog', { name: 'Join QR code' });
    expect(within(dialog).getByRole('img', { name: `QR code for ${URL}` })).toBeTruthy();
    expect(within(dialog).getByText('K7M2QX')).toBeTruthy();
    expect(within(dialog).getByText('quizup.kushu30.me/join/K7M2QX')).toBeTruthy();
  });

  it('closes with Escape and gives focus back to the QR', () => {
    renderZoom();
    const trigger = screen.getByRole('button', { name: 'Show the join QR code full screen' });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('closes with the Close button, or by tapping anywhere on it', () => {
    renderZoom();
    const open = () =>
      fireEvent.click(screen.getByRole('button', { name: 'Show the join QR code full screen' }));
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    open();
    fireEvent.click(screen.getByRole('dialog'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('stops the page behind from scrolling while it is open', () => {
    renderZoom();
    fireEvent.click(screen.getByRole('button', { name: 'Show the join QR code full screen' }));
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(document.body.style.overflow).toBe('');
  });

  it('puts focus on Close when it opens, so the keyboard works at once', () => {
    renderZoom();
    fireEvent.click(screen.getByRole('button', { name: 'Show the join QR code full screen' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
  });
});
