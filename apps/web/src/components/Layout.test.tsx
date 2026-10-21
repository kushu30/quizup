import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { usePageBrand, usePageFocus } from '../lib/brandContext';
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

vi.mock('./SystemStatus', () => ({
  SystemStatus: () => <button type="button">System status</button>,
}));

function BrandedBody({
  branding,
  hero,
}: {
  branding: Parameters<typeof usePageBrand>[0];
  hero: boolean;
}) {
  usePageBrand(branding, hero);
  return <p>Page body</p>;
}

function renderAt(path: string, branding: Parameters<typeof usePageBrand>[0] = null, hero = false) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="*" element={<BrandedBody branding={branding} hero={hero} />} />
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
    expect(screen.queryByRole('link', { name: 'My results' })).toBeNull();
  });

  it('shows host, admin and results links according to the account', () => {
    setAuth({ session: {}, canHost: true, isAdmin: true });
    renderAt('/');
    expect(screen.getAllByRole('link', { name: 'Host' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Admin' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'My results' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'Log in' })).toBeNull();
  });

  it('marks the current section as the current page', () => {
    setAuth({ session: {}, canHost: true });
    renderAt('/host/sessions/abc');
    const hostLink = screen.getAllByRole('link', { name: 'Quizzes' })[0];
    expect(hostLink?.getAttribute('aria-current')).toBe('page');
  });

  it('gives the quiz editor the whole screen, without the site header or footer', () => {
    setAuth({ session: {}, canHost: true });
    renderAt('/host/quizzes/abc');
    expect(screen.getByRole('main').getAttribute('data-layout')).toBe('workspace');
    expect(screen.queryByRole('banner')).toBeNull();
    expect(screen.queryByRole('contentinfo')).toBeNull();
  });

  it('takes hosts back to the landing page from the logo in the app sidebar', () => {
    setAuth({ session: {}, canHost: true });
    renderAt('/host');
    for (const link of screen.getAllByRole('link', { name: 'QuizUp home' })) {
      expect(link.getAttribute('href')).toBe('/');
    }
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
    expect(screen.getByRole('button', { name: 'Menu' }).getAttribute('aria-expanded')).toBe(
      'false',
    );
  });

  it('uses the wide layout for the host tools, its own for login and the dashboard, and the focused one elsewhere', () => {
    const cases: [string, string][] = [
      ['/host', 'app'],
      ['/host/quizzes/1/history', 'app'],
      ['/host/sessions/1', 'app'],
      ['/sessions/1/summary', 'app'],
      ['/admin', 'app'],
      ['/', 'landing'],
      ['/join', 'auth'],
      ['/play/ABC234', 'focused'],
      ['/login', 'auth'],
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

  it('keeps the QuizUp wordmark and plain page when the page has no brand', () => {
    renderAt('/');
    expect(screen.getByRole('link', { name: /QuizUp/ })).toBeTruthy();
    expect(screen.queryByTestId('brand-stripe')).toBeNull();
  });

  it('puts the institution in the header with a brand stripe and a light tint', () => {
    renderAt('/join/K7M2QX', { institutionName: 'St. Xavier College', brandColor: '#7A1F2B' });
    const home = screen.getByRole('link', { name: /St\. Xavier College/ });
    expect(home.textContent).toContain('Powered by');
    expect(screen.getByTestId('brand-stripe').getAttribute('style')).toContain(
      'background-color: rgb(122, 31, 43)',
    );
    const root = screen.getByRole('main').closest('div[data-brand]');
    expect(root?.getAttribute('style')).toContain('color-mix');
  });

  it('stays plain when the brand only carries text for the student intro', () => {
    renderAt('/join/K7M2QX', { welcomeMessage: 'Good luck.' });
    expect(screen.queryByTestId('brand-stripe')).toBeNull();
    expect(screen.getByRole('link', { name: /QuizUp/ })).toBeTruthy();
  });

  it('clears the brand when the page goes away', () => {
    const { unmount } = renderAt('/join/K7M2QX', { institutionName: 'St. Xavier College' });
    unmount();
    renderAt('/');
    expect(screen.queryByText('St. Xavier College')).toBeNull();
  });

  it('keeps the plain wordmark in the header when the page already shows a big brand card', () => {
    renderAt(
      '/join/K7M2QX',
      { institutionName: 'St. Xavier College', brandColor: '#7A1F2B' },
      true,
    );
    expect(screen.getByRole('link', { name: /QuizUp/ })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /St\. Xavier College/ })).toBeNull();
    expect(screen.getByTestId('brand-stripe')).toBeTruthy();
    expect(screen.getByRole('main').closest('div[data-brand]')?.getAttribute('style')).toContain(
      'color-mix',
    );
  });
});

function FocusBody({ branding }: { branding: Parameters<typeof usePageBrand>[0] }) {
  const [focused, setFocused] = useState(true);
  usePageFocus(focused);
  usePageBrand(branding);
  return (
    <button type="button" onClick={() => setFocused(false)}>
      Finish
    </button>
  );
}

function renderFocused(branding: Parameters<typeof usePageBrand>[0] = null) {
  return render(
    <MemoryRouter initialEntries={['/play/ABC234']}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="*" element={<FocusBody branding={branding} />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('Layout focus mode', () => {
  it('removes every way to leave the page while an assessment is in focus', () => {
    setAuth({ session: {}, canHost: true, isAdmin: true });
    renderFocused();
    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Menu' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Host' })).toBeNull();
    expect(screen.queryByRole('link', { name: /QuizUp/ })).toBeNull();
  });

  it('keeps the institution and QuizUp co-branding in a slim, non-clickable bar', () => {
    renderFocused({
      institutionName: 'Dayananda Sagar College of Engineering',
      brandColor: '#7A1F2B',
    });
    expect(screen.getByText('Dayananda Sagar College of Engineering')).toBeTruthy();
    expect(screen.getByTestId('brand-stripe')).toBeTruthy();
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Skip to content',
    ]);
  });

  it('shows the plain QuizUp wordmark in the slim bar when there is no brand', () => {
    renderFocused();
    expect(screen.getByRole('img', { name: 'QuizUp' })).toBeTruthy();
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Skip to content',
    ]);
  });

  it('brings the navigation back when focus ends', () => {
    renderFocused();
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeTruthy();
  });
});

describe('Layout footer', () => {
  it('says who to write to for host access', () => {
    renderAt('/join');
    const link = within(screen.getByRole('contentinfo')).getByRole('link', {
      name: 'kushagra.shukla2005@gmail.com',
    });
    expect(link.getAttribute('href')).toContain('mailto:kushagra.shukla2005@gmail.com');
  });

  it('ends every page with the logo and a quiet system status button', () => {
    renderAt('/join');
    const footer = screen.getByRole('contentinfo');
    expect(footer.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('QuizUp');
    expect(footer.textContent).toContain('open source');
    expect(screen.getByRole('button', { name: 'System status' })).toBeTruthy();
  });

  it('has no footer while an assessment is in focus', () => {
    renderFocused();
    expect(screen.queryByRole('contentinfo')).toBeNull();
  });
});
