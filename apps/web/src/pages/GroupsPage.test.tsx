import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { GroupsPage } from './GroupsPage';

vi.mock('../lib/api', () => ({
  describeError: (error: unknown) =>
    error instanceof Error ? error.message : 'Something went wrong',
  api: {
    listGroups: vi.fn(),
    getGroup: vi.fn(),
    createGroup: vi.fn(),
    updateGroup: vi.fn(),
    deleteGroup: vi.fn(),
  },
}));

const ID = '99999999-9999-4999-8999-999999999999';
const NINE_A = { id: ID, name: 'Year 9A', memberCount: 2 };

function renderPage() {
  return render(
    <MemoryRouter>
      <GroupsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(api.listGroups).mockResolvedValue([NINE_A]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('GroupsPage', () => {
  it('lists saved groups with their sizes', async () => {
    renderPage();
    expect(await screen.findByText('Year 9A')).toBeTruthy();
    expect(screen.getByText('2 students')).toBeTruthy();
  });

  it('explains the empty state', async () => {
    vi.mocked(api.listGroups).mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/You have no groups yet/)).toBeTruthy();
  });

  it('creates a group from a pasted list', async () => {
    vi.mocked(api.createGroup).mockResolvedValue({ id: ID, name: 'Year 9A', students: [] });
    renderPage();
    await screen.findByText('Year 9A');
    fireEvent.click(screen.getByRole('button', { name: 'New group' }));
    fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'Year 10B' } });
    fireEvent.change(screen.getByLabelText('Student list'), {
      target: { value: 'Asha Rao, asha@example.com\nBen Cole' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add students' }));
    expect(await screen.findByText(/Added 2 students/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save group' }));
    await waitFor(() =>
      expect(api.createGroup).toHaveBeenCalledWith({
        name: 'Year 10B',
        students: [
          { displayName: 'Asha Rao', email: 'asha@example.com' },
          { displayName: 'Ben Cole' },
        ],
      }),
    );
    await waitFor(() => expect(screen.queryByLabelText('Group name')).toBeNull());
  });

  it('edits an existing group: removes a student and skips duplicates when adding', async () => {
    vi.mocked(api.getGroup).mockResolvedValue({
      id: ID,
      name: 'Year 9A',
      students: [
        { displayName: 'Asha Rao', email: null },
        { displayName: 'Ben Cole', email: null },
      ],
    });
    vi.mocked(api.updateGroup).mockResolvedValue({ id: ID, name: 'Year 9A', students: [] });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Year 9A' }));
    const table = await screen.findByRole('table', { name: 'Students in this group' });
    fireEvent.click(within(table).getByRole('button', { name: 'Remove Ben Cole' }));
    fireEvent.change(screen.getByLabelText('Student list'), {
      target: { value: 'asha rao\nChen Wei' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add students' }));
    expect(await screen.findByText(/Added 1 student\. 1 already in the group/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save group' }));
    await waitFor(() =>
      expect(api.updateGroup).toHaveBeenCalledWith(ID, {
        name: 'Year 9A',
        students: [{ displayName: 'Asha Rao' }, { displayName: 'Chen Wei' }],
      }),
    );
  });

  it('points out a bad line and does not add anything', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'New group' }));
    fireEvent.change(screen.getByLabelText('Student list'), {
      target: { value: 'Asha, not-an-email' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add students' }));
    expect(await screen.findByText(/Line 1: The email address is not valid/)).toBeTruthy();
  });

  it('shows the server message when the name is taken', async () => {
    vi.mocked(api.createGroup).mockRejectedValue(
      new Error('You already have a group with that name'),
    );
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'New group' }));
    fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'Year 9A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save group' }));
    expect(await screen.findByText(/already have a group with that name/)).toBeTruthy();
    expect(screen.getByLabelText('Group name')).toBeTruthy();
  });

  it('deletes a group only after confirmation', async () => {
    vi.mocked(api.deleteGroup).mockResolvedValue(undefined);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Year 9A' }));
    expect(api.deleteGroup).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete group' }));
    await waitFor(() => expect(api.deleteGroup).toHaveBeenCalledWith(ID));
  });
});
