import type { DeviceInfo, ExamProgressRow } from '@quizup/shared';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExamProgressTable } from './ExamProgressTable';

vi.mock('../../hooks/useServerNow', () => ({ useServerNow: () => 0 }));

afterEach(cleanup);

const ADA = '11111111-1111-4111-8111-111111111111';
const GRACE = '22222222-2222-4222-8222-222222222222';

function row(participantId: string, displayName: string): ExamProgressRow {
  return {
    participantId,
    displayName,
    status: 'in_progress',
    answered: 2,
    totalQuestions: 5,
    startedAtServerMs: 0,
    deadlineAtServerMs: 60_000,
    proctorEventCount: 0,
    droppedEvents: 0,
    score: null,
  };
}

const PHONE: DeviceInfo = { kind: 'phone', os: 'iOS 17', browser: 'Safari 17', screen: null };

describe('ExamProgressTable device column', () => {
  it('shows what each student is using, with the details in a dropdown', () => {
    render(
      <ExamProgressTable
        rows={[row(ADA, 'Ada'), row(GRACE, 'Grace')]}
        devicesById={{ [ADA]: [PHONE] }}
        proctored
        offsetMs={0}
        selectedId={null}
        onSelect={() => undefined}
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'Device' })).toBeTruthy();
    const rows = screen.getAllByRole('row');
    expect(within(rows[1]!).getByText('Phone')).toBeTruthy();
    expect(within(rows[1]!).getByText('Phone, iOS 17, Safari 17')).toBeTruthy();
    expect(within(rows[2]!).getByText('Unknown')).toBeTruthy();
  });

  it('drops the proctor column when the exam is not proctored', () => {
    render(
      <ExamProgressTable
        rows={[row(ADA, 'Ada')]}
        devicesById={{}}
        proctored={false}
        offsetMs={0}
        selectedId={null}
        onSelect={() => undefined}
      />,
    );
    expect(screen.queryByRole('columnheader', { name: 'Proctor events' })).toBeNull();
    expect(screen.getByRole('columnheader', { name: 'Score' })).toBeTruthy();
  });
});
