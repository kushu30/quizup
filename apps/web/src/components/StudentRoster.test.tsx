import type { ParticipantPresence } from '@quizup/shared';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StudentRoster } from './StudentRoster';

afterEach(cleanup);

const participants: ParticipantPresence[] = [
  {
    participantId: '11111111-1111-4111-8111-111111111111',
    displayName: 'Ada Lovelace',
    connected: true,
  },
  {
    participantId: '22222222-2222-4222-8222-222222222222',
    displayName: 'Grace Hopper',
    connected: true,
  },
  {
    participantId: '33333333-3333-4333-8333-333333333333',
    displayName: 'Edsger Dijkstra',
    connected: false,
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
