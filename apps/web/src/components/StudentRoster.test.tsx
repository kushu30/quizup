import type { ParticipantPresence } from '@quizup/shared';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudentRoster } from './StudentRoster';

afterEach(cleanup);

const participants: ParticipantPresence[] = [
  {
    participantId: '11111111-1111-4111-8111-111111111111',
    displayName: 'Ada Lovelace',
    connected: true,
    devices: [],
  },
  {
    participantId: '22222222-2222-4222-8222-222222222222',
    displayName: 'Grace Hopper',
    connected: true,
    devices: [],
  },
  {
    participantId: '33333333-3333-4333-8333-333333333333',
    displayName: 'Edsger Dijkstra',
    connected: false,
    devices: [],
  },
];

describe('StudentRoster', () => {
  it('is a named region that counts connected students against everyone who joined', () => {
    render(<StudentRoster participants={participants} />);
    const region = screen.getByRole('region', { name: /^Students/ });
    expect(region.textContent).toContain('2 connected of 3');
  });

  it('lists every student in join order and announces who has disconnected', () => {
    render(<StudentRoster participants={participants} />);
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Ada Lovelace',
      'Grace Hopper',
      'Edsger Dijkstra (disconnected)',
    ]);
  });

  it('says nobody has joined when the list is empty', () => {
    render(<StudentRoster participants={[]} size="large" />);
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.getByText(/Nobody has joined yet/)).toBeTruthy();
  });
});

describe('StudentRoster let back in', () => {
  it('offers the button only for students who are disconnected', () => {
    render(<StudentRoster participants={participants} onLetBackIn={vi.fn()} />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Let Edsger Dijkstra back in' })).toBeTruthy();
  });

  it('offers nothing when the host has no way to reopen seats', () => {
    render(<StudentRoster participants={participants} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('reopens the seat and says for how long', async () => {
    const onLetBackIn = vi.fn().mockResolvedValue(undefined);
    render(<StudentRoster participants={participants} onLetBackIn={onLetBackIn} />);
    fireEvent.click(screen.getByRole('button', { name: 'Let Edsger Dijkstra back in' }));
    expect(onLetBackIn).toHaveBeenCalledWith('33333333-3333-4333-8333-333333333333');
    expect(await screen.findByText(/Open for 5 minutes/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Let Edsger Dijkstra back in' })).toBeNull();
  });

  it('keeps the button and says so when reopening fails', async () => {
    const onLetBackIn = vi.fn().mockRejectedValue(new Error('nope'));
    render(<StudentRoster participants={participants} onLetBackIn={onLetBackIn} />);
    fireEvent.click(screen.getByRole('button', { name: 'Let Edsger Dijkstra back in' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/could not/i));
    expect(screen.getByRole('button', { name: 'Let Edsger Dijkstra back in' })).toBeTruthy();
  });
});
