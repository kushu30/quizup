import type { RosterEmailPreview } from '@quizup/shared';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { EmailTokensDialog } from './EmailTokensDialog';

vi.mock('../lib/api', () => ({
  describeError: (error: unknown) =>
    error instanceof Error ? error.message : 'Something went wrong',
  api: {
    previewRosterEmail: vi.fn(),
    testRosterEmail: vi.fn(),
    emailRosterTokens: vi.fn(),
  },
}));

const SESSION = '44444444-4444-4444-8444-444444444444';
const ASHA = '00000000-0000-4000-8000-000000000001';

const PREVIEW: RosterEmailPreview = {
  to: 'asha@example.com',
  subject: 'Your access to Database systems mid-term',
  html: '<!doctype html><html><body><p>Hello Asha Rao</p></body></html>',
  text: 'Hello Asha Rao',
  sample: false,
};

function renderDialog(props: Partial<Parameters<typeof EmailTokensDialog>[0]> = {}) {
  const onClose = vi.fn();
  const onSent = vi.fn();
  render(
    <EmailTokensDialog
      sessionId={SESSION}
      rosterIds={undefined}
      recipientCount={2}
      onClose={onClose}
      onSent={onSent}
      {...props}
    />,
  );
  return { onClose, onSent };
}

async function settle() {
  await act(async () => {
    vi.advanceTimersByTime(500);
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.mocked(api.previewRosterEmail).mockResolvedValue(PREVIEW);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('EmailTokensDialog', () => {
  it('opens with the default wording and shows the mail as it will be sent', async () => {
    renderDialog({ rosterIds: [ASHA] });
    await settle();
    const dialog = screen.getByRole('dialog', { name: 'Email access tokens' });
    expect(dialog).toBeTruthy();
    expect((screen.getByLabelText('Subject') as HTMLInputElement).value).toBe(
      'Your access to {{quiz_title}}',
    );
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toContain(
      'Hello {{student_name}}',
    );
    expect(api.previewRosterEmail).toHaveBeenCalledWith(SESSION, {
      rosterId: ASHA,
      subject: 'Your access to {{quiz_title}}',
      message: expect.stringContaining('{{student_name}}'),
    });
    const frame = screen.getByTitle('Email preview') as HTMLIFrameElement;
    expect(frame.getAttribute('srcdoc')).toBe(PREVIEW.html);
    expect(frame.getAttribute('sandbox')).toBe('');
    expect(screen.getByText('Your access to Database systems mid-term')).toBeTruthy();
    expect(screen.getByText(/Preview for asha@example.com/)).toBeTruthy();
  });

  it('says plainly when the preview uses sample data', async () => {
    vi.mocked(api.previewRosterEmail).mockResolvedValue({ ...PREVIEW, to: null, sample: true });
    renderDialog();
    await settle();
    expect(screen.getByText(/Sample preview/)).toBeTruthy();
  });

  it('refreshes the preview after the host edits the message', async () => {
    renderDialog();
    await settle();
    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'Dear {{student_name}}, bring ID.' },
    });
    await settle();
    expect(api.previewRosterEmail).toHaveBeenLastCalledWith(SESSION, {
      rosterId: undefined,
      subject: 'Your access to {{quiz_title}}',
      message: 'Dear {{student_name}}, bring ID.',
    });
  });

  it('lists every placeholder and inserts one where the cursor is', async () => {
    renderDialog();
    await settle();
    const message = screen.getByLabelText('Message') as HTMLTextAreaElement;
    fireEvent.change(message, { target: { value: 'Code: ' } });
    message.setSelectionRange(6, 6);
    for (const label of [
      'Student name',
      'Quiz title',
      'Institution name',
      'Join code',
      'Access token',
      'Personal join link',
    ]) {
      expect(screen.getByRole('button', { name: new RegExp(`Insert ${label}`) })).toBeTruthy();
    }
    fireEvent.click(screen.getByRole('button', { name: /Insert Join code/ }));
    expect(message.value).toBe('Code: {{join_code}}');
  });

  it('flags an unknown placeholder, holds the send buttons and does not ask the server', async () => {
    renderDialog();
    await settle();
    vi.mocked(api.previewRosterEmail).mockClear();
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hi {{nickname}}' } });
    await settle();
    expect(screen.getByText(/Unknown placeholder: \{\{nickname\}\}/)).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Send to 2 students' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Send a test to me' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(api.previewRosterEmail).not.toHaveBeenCalled();
  });

  it('sends with the wording the host chose and reports back', async () => {
    const result = { sent: 2, skipped: [], failed: [] };
    vi.mocked(api.emailRosterTokens).mockResolvedValue(result);
    const { onClose, onSent } = renderDialog({ rosterIds: [ASHA], recipientCount: 1 });
    await settle();
    fireEvent.change(screen.getByLabelText('Subject'), {
      target: { value: 'Seat for {{quiz_title}}' },
    });
    await settle();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send to 1 student' }));
    });
    expect(api.emailRosterTokens).toHaveBeenCalledWith(SESSION, [ASHA], {
      subject: 'Seat for {{quiz_title}}',
      message: expect.stringContaining('{{student_name}}'),
    });
    expect(onSent).toHaveBeenCalledWith(result);
    expect(onClose).toHaveBeenCalled();
  });

  it('sends a test to the host and says where it went', async () => {
    vi.mocked(api.testRosterEmail).mockResolvedValue({ sentTo: 'host@example.com' });
    renderDialog();
    await settle();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send a test to me' }));
    });
    expect(screen.getByText('Test sent to host@example.com')).toBeTruthy();
    expect(api.emailRosterTokens).not.toHaveBeenCalled();
  });

  it('shows a send failure and stays open', async () => {
    vi.mocked(api.emailRosterTokens).mockRejectedValue(
      new Error('Email is not set up on this server'),
    );
    const { onClose } = renderDialog();
    await settle();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send to 2 students' }));
    });
    expect(screen.getByRole('alert').textContent).toContain('not set up');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('can go back to the default wording', async () => {
    renderDialog();
    await settle();
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Something else' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset to default wording' }));
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toContain(
      'Hello {{student_name}}',
    );
  });

  it('closes on Cancel or Escape without sending anything', async () => {
    const { onClose } = renderDialog();
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(api.emailRosterTokens).not.toHaveBeenCalled();
  });
});
