import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
});
