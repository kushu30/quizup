import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Landing } from './Landing';

vi.mock('../lib/AuthContext', () => ({
  useAuth: () => ({ canHost: false, session: null }),
}));

vi.mock('../components/ServerStatus', () => ({
  ServerStatus: () => <p>status</p>,
}));

function JoinProbe() {
  const location = useLocation();
  return <p>Join page {location.search}</p>;
}

function renderLanding(state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/', state }]}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/join" element={<JoinProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe('Landing', () => {
  it('takes a join code straight to the join form', () => {
    renderLanding();
    fireEvent.change(screen.getByLabelText('Join code'), { target: { value: ' k7m2qx ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Join page ?code=K7M2QX')).toBeTruthy();
  });

  it('asks for a code instead of navigating when the box is empty', () => {
    renderLanding();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.queryByText(/Join page/)).toBeNull();
    expect(screen.getByLabelText('Join code').getAttribute('aria-invalid')).toBe('true');
  });

  it('shows the notice it was redirected with', () => {
    renderLanding({ notice: 'Host access required.' });
    expect(screen.getByRole('status').textContent).toBe('Host access required.');
  });
});
