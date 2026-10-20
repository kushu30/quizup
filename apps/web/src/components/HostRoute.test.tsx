import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HostRoute } from './HostRoute';

vi.mock('../lib/AuthContext', () => ({
  useAuth: () => ({
    session: {},
    profile: { id: '1', role: 'student', name: 'Sam', email: 's@example.com' },
    loading: false,
  }),
}));

function Landing() {
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  return <p>{notice}</p>;
}

afterEach(cleanup);

describe('HostRoute', () => {
  it('sends a student home and tells them who to ask for access', () => {
    render(
      <MemoryRouter initialEntries={['/host']}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route element={<HostRoute />}>
            <Route path="/host" element={<p>Dashboard</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.queryByText('Dashboard')).toBeNull();
    expect(screen.getByText(/Host access required/).textContent).toContain(
      'kushagra.shukla2005@gmail.com',
    );
  });
});
