import type { DeviceInfo, ParticipantPresence, ProctorEventRecord } from '@quizup/shared';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveProctorPanel } from './LiveProctorPanel';

afterEach(cleanup);

const ADA = '11111111-1111-4111-8111-111111111111';
const GRACE = '22222222-2222-4222-8222-222222222222';
const SESSION = '44444444-4444-4444-8444-444444444444';

const PHONE: DeviceInfo = { kind: 'phone', os: 'iOS 17', browser: 'Safari 17', screen: null };

const participants: ParticipantPresence[] = [
  { participantId: ADA, displayName: 'Ada', connected: true, devices: [PHONE] },
  { participantId: GRACE, displayName: 'Grace', connected: true, devices: [] },
];

function event(
  id: number,
  participantId: string,
  type: ProctorEventRecord['type'],
  serverAt: number,
): ProctorEventRecord {
  return {
    id: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
    sessionId: SESSION,
    participantId,
    attemptId: null,
    type,
    clientAt: serverAt,
    serverAt,
    late: false,
    detail: null,
  };
}

function renderPanel(events: ProctorEventRecord[], selectedId: string | null = null) {
  const onSelect = vi.fn();
  render(
    <LiveProctorPanel
      participants={participants}
      events={events}
      selectedId={selectedId}
      onSelect={onSelect}
    />,
  );
  return { onSelect };
}

describe('LiveProctorPanel', () => {
  it('counts only the signals that count, per student', () => {
    renderPanel([
      event(1, ADA, 'tab_switch', 1000),
      event(2, ADA, 'focus_return', 2000),
      event(3, ADA, 'paste', 3000),
    ]);
    const rows = screen.getAllByRole('row');
    expect(within(rows[1]!).getByText('Ada')).toBeTruthy();
    expect(within(rows[1]!).getByTitle(/2 proctor events/)).toBeTruthy();
    expect(within(rows[2]!).getByTitle(/0 proctor events/)).toBeTruthy();
  });

  it('names the latest signal and says when there is none', () => {
    renderPanel([event(1, ADA, 'tab_switch', 1000), event(2, ADA, 'paste', 3000)]);
    const rows = screen.getAllByRole('row');
    expect(rows[1]?.textContent).toContain('Paste');
    expect(rows[2]?.textContent).toContain('None yet');
  });

  it('highlights a student above the threshold', () => {
    const many = Array.from({ length: 6 }, (_, index) =>
      event(index + 1, ADA, 'tab_switch', 1000 + index),
    );
    renderPanel(many);
    expect(screen.getByTitle(/6 proctor events.*above the highlight threshold/)).toBeTruthy();
  });

  it('lets the host open one student and shows the device in a dropdown', () => {
    const { onSelect } = renderPanel([]);
    fireEvent.click(screen.getByRole('button', { name: 'Ada' }));
    expect(onSelect).toHaveBeenCalledWith(ADA);
    expect(screen.getByText('Phone, iOS 17, Safari 17')).toBeTruthy();
  });

  it('says so when nobody has joined', () => {
    render(<LiveProctorPanel participants={[]} events={[]} selectedId={null} onSelect={vi.fn()} />);
    expect(screen.getByText('No students yet.')).toBeTruthy();
  });
});
