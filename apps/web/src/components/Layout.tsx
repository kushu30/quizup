import { useEffect, useId, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { buttonClasses } from './ui';

const WIDE_PREFIXES = ['/host', '/sessions/', '/admin'];

function isWidePath(pathname: string): boolean {
  return WIDE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

interface NavItem {
  to: string;
  label: string;
}

function desktopLinkClass({ isActive }: { isActive: boolean }) {
  return `inline-flex h-16 items-center border-b-2 text-sm font-medium transition-colors ${
    isActive ? 'border-board text-ink' : 'border-transparent text-muted hover:text-ink'
  }`;
}

function mobileLinkClass({ isActive }: { isActive: boolean }) {
  return `block rounded-md px-3 py-2.5 text-base font-medium ${
    isActive ? 'bg-board-soft text-board' : 'text-ink hover:bg-paper'
  }`;
}

export function Layout() {
  const { session, canHost, isAdmin, signOut } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const wide = isWidePath(location.pathname);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const items: NavItem[] = [
    { to: '/join', label: 'Join a quiz' },
    ...(canHost ? [{ to: '/host', label: 'Host' }] : []),
    ...(isAdmin ? [{ to: '/admin', label: 'Admin' }] : []),
    ...(session ? [{ to: '/me/learner-profile', label: 'My learning data' }] : []),
  ];

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:shadow"
      >
        Skip to content
      </a>
      <header className="border-b border-rule bg-surface">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-4">
          <Link
            to="/"
            className="flex items-center gap-2.5 rounded-md text-lg font-bold tracking-tight"
          >
            <span
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded-md bg-board text-base font-bold text-white"
            >
              Q
            </span>
            QuizUp
          </Link>

          <nav aria-label="Primary" className="hidden flex-1 md:block">
            <ul className="flex items-center gap-7">
              {items.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to} className={desktopLinkClass}>
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <div className="hidden md:block">
            {session ? (
              <button
                type="button"
                onClick={() => void signOut()}
                className={buttonClasses('ghost', 'sm')}
              >
                Sign out
              </button>
            ) : (
              <Link to="/login" className={buttonClasses('secondary', 'sm')}>
                Log in
              </Link>
            )}
          </div>

          <button
            type="button"
            aria-expanded={menuOpen}
            aria-controls={menuId}
            onClick={() => setMenuOpen((open) => !open)}
            className={`${buttonClasses('secondary', 'sm')} md:hidden`}
          >
            Menu
          </button>
        </div>

        <div
          id={menuId}
          hidden={!menuOpen}
          className="border-t border-rule px-4 pt-2 pb-4 md:hidden"
        >
          <ul className="space-y-1">
            {items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={mobileLinkClass}
                  onClick={() => setMenuOpen(false)}
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
          <div className="mt-3 border-t border-rule pt-3">
            {session ? (
              <button
                type="button"
                onClick={() => void signOut()}
                className={`${buttonClasses('secondary', 'md')} w-full`}
              >
                Sign out
              </button>
            ) : (
              <Link
                to="/login"
                onClick={() => setMenuOpen(false)}
                className={`${buttonClasses('secondary', 'md')} w-full`}
              >
                Log in
              </Link>
            )}
          </div>
        </div>
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        data-layout={wide ? 'wide' : 'focused'}
        className={`mx-auto w-full flex-1 px-4 py-8 focus:outline-none sm:py-12 ${
          wide ? 'max-w-6xl' : 'max-w-3xl'
        }`}
      >
        <Outlet />
      </main>
    </div>
  );
}
