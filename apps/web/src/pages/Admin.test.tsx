import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { Admin } from './Admin';

const calls = vi.hoisted(() => ({
  insert: vi.fn(),
  entries: [] as { email: string; granted_by: string | null; created_at: string }[],
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ order: async () => ({ data: calls.entries, error: null }) }),
      insert: async (row: unknown) => {
        calls.insert(row);
        return { error: null };
      },
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
  },
}));

vi.mock('../lib/api', () => ({
  describeError: (error: unknown) =>
    error instanceof Error ? error.message : 'Something went wrong',
  api: { notifyHostAccess: vi.fn() },
}));

vi.mock('../lib/AuthContext', () => ({
  useAuth: () => ({
    session: {},
    profile: { id: '1', role: 'admin', name: 'Admin', email: 'admin@example.com' },
    loading: false,
  }),
}));

function renderAdmin() {
  return render(
    <MemoryRouter>
      <Admin />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.mocked(api.notifyHostAccess).mockReset();
  calls.insert.mockReset();
  calls.entries = [];
});

describe('Admin host allowlist', () => {
  it('rejects an invalid email on the labelled field without inserting', async () => {
    renderAdmin();
    fireEvent.change(screen.getByLabelText('Host email'), { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add host' }));
    expect(await screen.findByText('Enter a valid email address')).toBeTruthy();
    expect(screen.getByLabelText('Host email').getAttribute('aria-invalid')).toBe('true');
    expect(calls.insert).not.toHaveBeenCalled();
  });

  it('adds a valid email', async () => {
    renderAdmin();
    fireEvent.change(screen.getByLabelText('Host email'), {
      target: { value: 'teacher@school.org' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add host' }));
    await waitFor(() => expect(calls.insert).toHaveBeenCalledWith({ email: 'teacher@school.org' }));
  });

  it('lists allowed hosts with a named remove button', async () => {
    calls.entries = [
      { email: 'teacher@school.org', granted_by: null, created_at: '2026-10-01T10:00:00.000Z' },
    ];
    renderAdmin();
    expect(await screen.findByRole('button', { name: 'Remove teacher@school.org' })).toBeTruthy();
  });

  it('emails a new host straight after adding them', async () => {
    vi.mocked(api.notifyHostAccess).mockResolvedValue(undefined);
    renderAdmin();
    fireEvent.change(screen.getByLabelText('Host email'), {
      target: { value: 'teacher@school.org' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add host' }));
    await waitFor(() => expect(api.notifyHostAccess).toHaveBeenCalledWith('teacher@school.org'));
    expect(await screen.findByText(/We emailed teacher@school.org/)).toBeTruthy();
  });

  it('keeps the host added and says plainly when the email could not be sent', async () => {
    vi.mocked(api.notifyHostAccess).mockRejectedValue(
      new Error('Email is not set up on this server'),
    );
    renderAdmin();
    fireEvent.change(screen.getByLabelText('Host email'), {
      target: { value: 'teacher@school.org' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add host' }));
    const notice = await screen.findByText(/was added, but the email was not sent/i);
    expect(notice.textContent).toContain('Email is not set up on this server');
    expect(calls.insert).toHaveBeenCalledWith({ email: 'teacher@school.org' });
  });

  it('can send the email again from the list', async () => {
    vi.mocked(api.notifyHostAccess).mockResolvedValue(undefined);
    calls.entries = [
      { email: 'teacher@school.org', granted_by: null, created_at: '2026-10-01T10:00:00.000Z' },
    ];
    renderAdmin();
    fireEvent.click(await screen.findByRole('button', { name: 'Email teacher@school.org again' }));
    await waitFor(() => expect(api.notifyHostAccess).toHaveBeenCalledWith('teacher@school.org'));
  });
});
