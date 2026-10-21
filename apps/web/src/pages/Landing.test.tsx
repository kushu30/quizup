import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Landing } from './Landing';

const authState = vi.hoisted(() => ({
  value: { canHost: false, session: null as unknown, profile: null as { name: string } | null },
}));

vi.mock('../lib/useServerPulse', () => ({
  useServerPulse: () => ({ state: 'online', latencyMs: 30 }),
}));

vi.mock('../lib/AuthContext', () => ({
  useAuth: () => authState.value,
}));

function JoinProbe() {
  const location = useLocation();
  return <p>Join page {location.pathname}</p>;
}

function renderLanding(state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/', state }]}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/join" element={<JoinProbe />} />
        <Route path="/login" element={<JoinProbe />} />
        <Route path="/host" element={<JoinProbe />} />
        <Route path="/join/:code" element={<JoinProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  authState.value = { canHost: false, session: null, profile: null };
});

describe('Landing', () => {
  it('takes a join code straight to the join form', () => {
    renderLanding();
    fireEvent.change(screen.getByLabelText('Join code'), { target: { value: ' k7m2qx ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Join page /join/K7M2QX')).toBeTruthy();
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

  it('opens with one clear headline and a single code box', () => {
    renderLanding();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getAllByLabelText('Join code')).toHaveLength(1);
  });

  it('shows the three ways to run an assessment', () => {
    renderLanding();
    for (const name of ['Live quiz', 'Adaptive quiz', 'Timed exam']) {
      expect(screen.getByRole('heading', { level: 3, name })).toBeTruthy();
    }
  });

  it('explains how it works as three ordered steps', () => {
    renderLanding();
    const steps = screen.getByRole('list', { name: 'How it works' });
    expect(steps.tagName).toBe('OL');
    expect(steps.querySelectorAll(':scope > li')).toHaveLength(3);
  });

  it('describes what makes it fit a real classroom', () => {
    renderLanding();
    for (const name of [
      'Your institution on every screen',
      'Invited students only',
      'Proctoring when you want it',
      'Nobody loses their place',
      'Anonymous feedback',
      'History and exports',
    ]) {
      expect(screen.getByRole('heading', { level: 3, name })).toBeTruthy();
    }
  });

  it('no longer carries the server status, which lives in the footer', () => {
    renderLanding();
    expect(screen.queryByText(/system status/i)).toBeNull();
    expect(screen.queryByText(/socket round trip/i)).toBeNull();
  });

  it('sends signed-out visitors to log in to host, and hosts to their dashboard', () => {
    const { unmount } = renderLanding();
    fireEvent.click(screen.getAllByRole('link', { name: 'Log in to host' })[0]!);
    expect(screen.getByText('Join page /login')).toBeTruthy();
    unmount();
    authState.value = { canHost: true, session: {}, profile: null };
    renderLanding();
    expect(screen.queryByRole('link', { name: 'Log in to host' })).toBeNull();
    expect(screen.getAllByRole('link', { name: 'Open your dashboard' }).length).toBeGreaterThan(0);
  });

  it('lets a signed-in student ask for host access by email', () => {
    authState.value = { canHost: false, session: {}, profile: { name: 'Sam' } };
    renderLanding();
    const link = screen.getAllByRole('link', { name: 'Request host access' })[0]!;
    expect(link.getAttribute('href')).toMatch(/^mailto:kushagra\.shukla2005@gmail\.com/);
  });

  it('does not offer to request access to someone who already hosts', () => {
    authState.value = { canHost: true, session: {}, profile: null };
    renderLanding();
    expect(screen.queryByRole('link', { name: 'Request host access' })).toBeNull();
  });
});
