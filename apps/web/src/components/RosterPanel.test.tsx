import type { IssuedToken, RosterEntry } from '@quizup/shared';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { saveBlob } from '../lib/download';
import { RosterPanel } from './RosterPanel';

vi.mock('../lib/api', () => ({
  describeError: (error: unknown) =>
    error instanceof Error ? error.message : 'Something went wrong',
  api: {
    getRoster: vi.fn(),
    addRoster: vi.fn(),
    reissueRosterToken: vi.fn(),
    removeRosterEntry: vi.fn(),
    emailRosterTokens: vi.fn(),
  },
}));
vi.mock('../lib/download', () => ({ saveBlob: vi.fn() }));

const dialog = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }));

vi.mock('./EmailTokensDialog', () => ({
  EmailTokensDialog: (props: Record<string, unknown>) => {
    dialog.props = props;
    return (
      <div role="dialog" aria-label="Email dialog stub">
        <button type="button" onClick={() => (props.onClose as () => void)()}>
          Close stub
        </button>
      </div>
    );
  },
}));

const SESSION = '44444444-4444-4444-8444-444444444444';

const ASHA: RosterEntry = {
  id: '00000000-0000-4000-8000-000000000001',
  displayName: 'Asha Rao',
  email: 'asha@example.com',
  participantId: '10000000-0000-4000-8000-000000000001',
  connected: true,
  openedElsewhere: 0,
  emailable: true,
};
const BEN: RosterEntry = {
  id: '00000000-0000-4000-8000-000000000002',
  displayName: 'Ben Cole',
  email: null,
  participantId: null,
  connected: false,
  openedElsewhere: 0,
  emailable: false,
};

function issued(entry: RosterEntry, token: string): IssuedToken {
  return { rosterId: entry.id, displayName: entry.displayName, email: entry.email, token };
}

function renderPanel() {
  return render(<RosterPanel sessionId={SESSION} joinCode="ABC234" refreshKey={0} />);
}

beforeEach(() => {
  vi.mocked(api.getRoster).mockResolvedValue({ entries: [ASHA, BEN], emailEnabled: true });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('RosterPanel', () => {
  it('lists invited students with who has joined and who is connected', async () => {
    renderPanel();
    const region = await screen.findByRole('region', { name: 'Invited students' });
    expect(region.textContent).toContain('1 of 2 joined');
    const rows = within(region).getAllByRole('row');
    expect(rows[1]?.textContent).toContain('Asha Rao');
    expect(rows[1]?.textContent).toContain('Connected');
    expect(rows[2]?.textContent).toContain('Ben Cole');
    expect(rows[2]?.textContent).toContain('Not joined');
  });

  it('flags a token that was opened on another device', async () => {
    vi.mocked(api.getRoster).mockResolvedValue({
      entries: [{ ...ASHA, openedElsewhere: 2 }, BEN],
      emailEnabled: true,
    });
    renderPanel();
    expect(await screen.findByText(/Opened on another device 2 times/)).toBeTruthy();
  });

  it('adds students from pasted lines and shows each token once, with a download', async () => {
    vi.mocked(api.addRoster).mockResolvedValue({
      entries: [ASHA, BEN],
      issued: [issued(ASHA, 'ABCDE-23456'), issued(BEN, 'FGHJK-78923')],
    });
    renderPanel();
    await screen.findByRole('region', { name: 'Invited students' });
    fireEvent.change(screen.getByLabelText('Student list'), {
      target: { value: 'Asha Rao, asha@example.com\nBen Cole' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add students' }));
    await waitFor(() =>
      expect(api.addRoster).toHaveBeenCalledWith(SESSION, [
        { displayName: 'Asha Rao', email: 'asha@example.com' },
        { displayName: 'Ben Cole' },
      ]),
    );
    expect(await screen.findByText('ABCDE-23456')).toBeTruthy();
    expect(screen.getByText('FGHJK-78923')).toBeTruthy();
    expect(screen.getByText(/shown only now/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Download tokens (CSV)' }));
    expect(saveBlob).toHaveBeenCalledTimes(1);
    const blob = vi.mocked(saveBlob).mock.calls[0]?.[0] as Blob;
    const csv = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob);
    });
    expect(csv).toContain('ABCDE-23456');
  });

  it('points out bad lines by number and does not send anything', async () => {
    renderPanel();
    await screen.findByRole('region', { name: 'Invited students' });
    fireEvent.change(screen.getByLabelText('Student list'), {
      target: { value: 'Asha\nBen, not-an-email' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add students' }));
    expect(screen.getByRole('alert').textContent).toContain('Line 2');
    expect(api.addRoster).not.toHaveBeenCalled();
  });

  it('shows the server reason when the list is refused', async () => {
    vi.mocked(api.addRoster).mockRejectedValue(new Error('Asha Rao is already on the list'));
    renderPanel();
    await screen.findByRole('region', { name: 'Invited students' });
    fireEvent.change(screen.getByLabelText('Student list'), { target: { value: 'Asha Rao' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add students' }));
    expect((await screen.findByRole('alert')).textContent).toContain('already on the list');
  });

  it('issues a new token for one student and shows it', async () => {
    vi.mocked(api.reissueRosterToken).mockResolvedValue({ issued: issued(BEN, 'QQQQQ-22222') });
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'New token for Ben Cole' }));
    expect(await screen.findByText('QQQQQ-22222')).toBeTruthy();
    expect(api.reissueRosterToken).toHaveBeenCalledWith(SESSION, BEN.id);
  });

  it('removes a student who has not joined, and offers no removal after they have', async () => {
    vi.mocked(api.removeRosterEntry).mockResolvedValue(undefined);
    renderPanel();
    await screen.findByRole('region', { name: 'Invited students' });
    expect(screen.queryByRole('button', { name: 'Remove Asha Rao' })).toBeNull();
    vi.mocked(api.getRoster).mockResolvedValue({ entries: [ASHA], emailEnabled: true });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove Ben Cole' }));
    });
    expect(api.removeRosterEntry).toHaveBeenCalledWith(SESSION, BEN.id);
    await waitFor(() =>
      expect(
        within(screen.getByRole('region', { name: 'Invited students list' })).queryByText(
          'Ben Cole',
        ),
      ).toBeNull(),
    );
  });

  it('refreshes the list when told something changed', async () => {
    const { rerender } = renderPanel();
    await screen.findByRole('region', { name: 'Invited students' });
    rerender(<RosterPanel sessionId={SESSION} joinCode="ABC234" refreshKey={1} />);
    await waitFor(() => expect(api.getRoster).toHaveBeenCalledTimes(2));
  });

  it('keeps checking for changes on its own, such as a token opened on another device', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    try {
      renderPanel();
      await act(async () => {
        await Promise.resolve();
      });
      expect(api.getRoster).toHaveBeenCalledTimes(1);
      await act(async () => {
        vi.advanceTimersByTime(5000);
        await Promise.resolve();
      });
      expect(api.getRoster).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens the email dialog for everyone who can be emailed', async () => {
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Email tokens' }));
    expect(screen.getByRole('dialog', { name: 'Email dialog stub' })).toBeTruthy();
    expect(dialog.props).toMatchObject({
      sessionId: SESSION,
      rosterIds: undefined,
      recipientCount: 1,
    });
    expect(api.emailRosterTokens).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close stub' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens it for one student from their row, only when they have an email', async () => {
    renderPanel();
    await screen.findByRole('region', { name: 'Invited students' });
    expect(screen.queryByRole('button', { name: 'Email token to Ben Cole' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Email token to Asha Rao' }));
    expect(dialog.props).toMatchObject({ rosterIds: [ASHA.id], recipientCount: 1 });
  });

  it('reports who was left out, and who failed, after the dialog sends', async () => {
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Email tokens' }));
    act(() => {
      (dialog.props?.onSent as (result: unknown) => void)({
        sent: 1,
        skipped: [{ rosterId: BEN.id, reason: 'no_email' }],
        failed: [{ rosterId: ASHA.id, displayName: 'Asha Rao' }],
      });
    });
    expect(screen.getByText(/Sent 1 email/)).toBeTruthy();
    expect(screen.getByText(/1 student has no email/)).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Asha Rao');
  });

  it('hides every email button when the server has no email set up', async () => {
    vi.mocked(api.getRoster).mockResolvedValue({ entries: [ASHA, BEN], emailEnabled: false });
    renderPanel();
    await screen.findByRole('region', { name: 'Invited students' });
    expect(screen.queryByRole('button', { name: 'Email tokens' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Email token to/ })).toBeNull();
  });

  it('offers a sample list to download', async () => {
    renderPanel();
    await screen.findByRole('region', { name: 'Invited students' });
    fireEvent.click(screen.getByRole('tab', { name: 'Upload a CSV' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download a sample CSV' }));
    expect(saveBlob).toHaveBeenCalledTimes(1);
    expect(vi.mocked(saveBlob).mock.calls[0]?.[1]).toBe('quizup-sample-students.csv');
    const blob = vi.mocked(saveBlob).mock.calls[0]?.[0] as Blob;
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob);
    });
    expect(text).toContain('name,email');
  });

  it('fills the box from a CSV file, header row and all', async () => {
    renderPanel();
    await screen.findByRole('region', { name: 'Invited students' });
    const file = new File(['name,email\nAsha Rao,asha@example.com\nBen Cole,\n'], 'students.csv', {
      type: 'text/csv',
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Upload a CSV' }));
    fireEvent.change(screen.getByLabelText('Choose a CSV file'), { target: { files: [file] } });
    await waitFor(() =>
      expect((screen.getByLabelText('Student list') as HTMLTextAreaElement).value).toContain(
        'Asha Rao, asha@example.com',
      ),
    );
    expect((screen.getByLabelText('Student list') as HTMLTextAreaElement).value).toContain(
      'Ben Cole',
    );
  });

  describe('the invite flow', () => {
    it('lays the job out as three numbered steps', async () => {
      renderPanel();
      await screen.findByRole('region', { name: 'Invited students' });
      for (const name of ['Add students', 'Send each student their token', 'Watch them join']) {
        expect(screen.getByRole('heading', { level: 3, name })).toBeTruthy();
      }
      const steps = screen.getByRole('list', { name: 'How inviting students works' });
      expect(steps.tagName).toBe('OL');
      expect(steps.querySelectorAll(':scope > li')).toHaveLength(3);
    });

    it('starts on pasting a list and shows exactly what to type', async () => {
      renderPanel();
      await screen.findByRole('region', { name: 'Invited students' });
      expect(screen.getByRole('tab', { name: 'Paste a list' }).getAttribute('aria-selected')).toBe(
        'true',
      );
      expect(screen.getByText(/One student per line/)).toBeTruthy();
      expect(screen.getByText('Asha Rao, asha@example.com')).toBeTruthy();
      expect(screen.getByText(/email is optional/i)).toBeTruthy();
    });

    it('explains the CSV columns on the upload tab and offers a sample', async () => {
      renderPanel();
      await screen.findByRole('region', { name: 'Invited students' });
      fireEvent.click(screen.getByRole('tab', { name: 'Upload a CSV' }));
      expect(screen.getByRole('tab', { name: 'Upload a CSV' }).getAttribute('aria-selected')).toBe(
        'true',
      );
      const guide = screen.getByRole('table', { name: 'CSV columns' });
      expect(within(guide).getByText('name')).toBeTruthy();
      expect(within(guide).getByText('email')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Download a sample CSV' })).toBeTruthy();
      expect(screen.getByLabelText('Choose a CSV file')).toBeTruthy();
    });

    it('loads a chosen file into the list, says how many it read, and lets the host check it before adding', async () => {
      renderPanel();
      await screen.findByRole('region', { name: 'Invited students' });
      fireEvent.click(screen.getByRole('tab', { name: 'Upload a CSV' }));
      const file = new File(
        ['name,email\nAsha Rao,asha@example.com\nBen Cole,\n'],
        'students.csv',
        {
          type: 'text/csv',
        },
      );
      fireEvent.change(screen.getByLabelText('Choose a CSV file'), { target: { files: [file] } });
      expect(await screen.findByText(/Loaded 2 students from students\.csv/)).toBeTruthy();
      expect(screen.getByRole('tab', { name: 'Paste a list' }).getAttribute('aria-selected')).toBe(
        'true',
      );
      expect(api.addRoster).not.toHaveBeenCalled();
    });

    it('clears the loaded-file note once the students have been added', async () => {
      vi.mocked(api.addRoster).mockResolvedValue({
        entries: [ASHA],
        issued: [issued(ASHA, 'ABCDE-23456')],
      });
      renderPanel();
      await screen.findByRole('region', { name: 'Invited students' });
      fireEvent.click(screen.getByRole('tab', { name: 'Upload a CSV' }));
      const file = new File(['name,email\nAsha Rao,asha@example.com\n'], 'students.csv', {
        type: 'text/csv',
      });
      fireEvent.change(screen.getByLabelText('Choose a CSV file'), { target: { files: [file] } });
      await screen.findByText(/Loaded 1 student from students\.csv/);
      fireEvent.click(screen.getByRole('button', { name: 'Add students' }));
      await waitFor(() => expect(screen.queryByText(/Loaded 1 student/)).toBeNull());
    });

    it('says step two waits for students, then offers the ways to send tokens', async () => {
      vi.mocked(api.getRoster).mockResolvedValue({ entries: [], emailEnabled: true });
      const { unmount } = renderPanel();
      expect(await screen.findByText(/Add students first/)).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Email tokens' })).toBeNull();
      unmount();
      vi.mocked(api.getRoster).mockResolvedValue({ entries: [ASHA, BEN], emailEnabled: true });
      renderPanel();
      expect(await screen.findByRole('button', { name: 'Email tokens' })).toBeTruthy();
      expect(screen.getByText(/Each row also has a Copy link button/)).toBeTruthy();
    });

    it('tells the host plainly what to do instead when email is not set up', async () => {
      vi.mocked(api.getRoster).mockResolvedValue({ entries: [ASHA, BEN], emailEnabled: false });
      renderPanel();
      expect(await screen.findByText(/Email is not set up on this server/)).toBeTruthy();
      expect(screen.getByText(/Download the tokens CSV or copy each link/)).toBeTruthy();
    });

    it('shows how many have joined in the last step', async () => {
      renderPanel();
      const region = await screen.findByRole('region', { name: 'Invited students' });
      expect(within(region).getByText(/1 of 2 joined/)).toBeTruthy();
    });
  });
});
