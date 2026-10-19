import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Layout } from './Layout';

const authState = vi.hoisted(() => ({
  value: {
    session: null as unknown,
    canHost: false,
    isAdmin: false,
    signOut: vi.fn(async () => undefined),
  },
}));

vi.mock('../lib/AuthContext', () => ({
  useAuth: () => authState.value,
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="*" element={<p>Page body</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

function setAuth(next: Partial<typeof authState.value>) {
  authState.value = { ...authState.value, ...next };
}

afterEach(() => {
  cleanup();
  setAuth({ session: null, canHost: false, isAdmin: false, signOut: vi.fn(async () => undefined) });
});

describe('Layout', () => {
  it('offers joining and logging in to signed-out visitors only', () => {
    renderAt('/');
    const primary = screen.getByRole('navigation', { name: 'Primary' });
    expect(primary.textContent).toContain('Join a quiz');
    expect(screen.getAllByRole('link', { name: 'Log in' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'Host' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'My learning data' })).toBeNull();
  });

  it('shows host, admin and learning data links according to the account', () => {
    setAuth({ session: {}, canHost: true, isAdmin: true });
    renderAt('/');
    expect(screen.getAllByRole('link', { name: 'Host' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Admin' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'My learning data' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'Log in' })).toBeNull();
  });

  it('marks the current section as the current page', () => {
    setAuth({ session: {}, canHost: true });
    renderAt('/host/quizzes/abc');
    const hostLink = screen.getAllByRole('link', { name: 'Host' })[0];
    expect(hostLink?.getAttribute('aria-current')).toBe('page');
  });

  it('signs out from the header', () => {
    const signOut = vi.fn(async () => undefined);
    setAuth({ session: {}, signOut });
    renderAt('/');
    fireEvent.click(screen.getAllByRole('button', { name: 'Sign out' })[0] as HTMLElement);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('opens and closes the small-screen menu', () => {
    renderAt('/');
    const toggle = screen.getByRole('button', { name: 'Menu' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const menu = document.getElementById(toggle.getAttribute('aria-controls') ?? '');
    expect(menu?.hidden).toBe(false);
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(menu?.hidden).toBe(true);
  });

  it('closes the small-screen menu after following a link', () => {
    renderAt('/');
    const toggle = screen.getByRole('button', { name: 'Menu' });
    fireEvent.click(toggle);
    const menu = document.getElementById(toggle.getAttribute('aria-controls') ?? '') as HTMLElement;
    const joinLink = Array.from(menu.querySelectorAll('a')).find(
      (link) => link.textContent === 'Join a quiz',
    ) as HTMLElement;
    fireEvent.click(joinLink);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('uses the wide layout for host, summary and admin pages and the focused one elsewhere', () => {
    const cases: [string, string][] = [
      ['/host', 'wide'],
      ['/host/sessions/1', 'wide'],
      ['/sessions/1/summary', 'wide'],
      ['/admin', 'wide'],
      ['/', 'focused'],
      ['/join', 'focused'],
      ['/play/ABC234', 'focused'],
      ['/login', 'focused'],
    ];
    for (const [path, expected] of cases) {
      const { unmount } = renderAt(path);
      expect(screen.getByRole('main').getAttribute('data-layout')).toBe(expected);
      unmount();
    }
  });

  it('lets keyboard users skip to the page content', () => {
    renderAt('/');
    const skip = screen.getByRole('link', { name: 'Skip to content' });
    expect(skip.getAttribute('href')).toBe('#main-content');
    expect(screen.getByRole('main').id).toBe('main-content');
  });
});
