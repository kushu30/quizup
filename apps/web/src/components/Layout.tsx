import { useEffect, useId, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { HOST_ACCESS_CONTACT_EMAIL, HOST_ACCESS_MAILTO } from '../lib/contact';
import { BrandProvider, hasVisibleBrand, useBrand, useFocus } from '../lib/brandContext';
import { BrandMark } from './branding/BrandMark';
import { QuizUpLogo } from './brand/QuizUpLogo';
import { SystemStatus } from './SystemStatus';
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
  return (
    <BrandProvider>
      <LayoutFrame />
    </BrandProvider>
  );
}

function LayoutFrame() {
  const { session, canHost, isAdmin, signOut } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const layout =
    location.pathname === '/' ? 'landing' : isWidePath(location.pathname) ? 'wide' : 'focused';
  const { branding: brand, hero } = useBrand();
  const branded = hasVisibleBrand(brand);
  const focus = useFocus();

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const items: NavItem[] = [
    { to: '/join', label: 'Join a quiz' },
    ...(canHost ? [{ to: '/host', label: 'Host' }] : []),
    ...(isAdmin ? [{ to: '/admin', label: 'Admin' }] : []),
    ...(session ? [{ to: '/me/results', label: 'My results' }] : []),
  ];

  const lockup =
    branded && (!hero || focus) ? (
      <BrandMark branding={{ ...brand, tagline: undefined }} />
    ) : (
      <QuizUpLogo size={30} />
    );

  return (
    <div
      data-brand={branded ? 'true' : undefined}
      className="flex min-h-screen flex-col bg-paper text-ink"
      style={
        branded && brand.brandColor
          ? { backgroundColor: `color-mix(in srgb, ${brand.brandColor} 5%, #f7f8fa)` }
          : undefined
      }
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:shadow"
      >
        Skip to content
      </a>
      <header className="border-b border-rule bg-surface">
        {branded && (
          <div
            data-testid="brand-stripe"
            aria-hidden="true"
            className="h-1.5"
            style={{ backgroundColor: brand.brandColor ?? '#1e5446' }}
          />
        )}
        {focus ? (
          <div className="mx-auto flex h-12 max-w-6xl items-center gap-2.5 px-4 text-base font-bold tracking-tight">
            {lockup}
          </div>
        ) : (
          <>
            <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-4">
              <Link
                to="/"
                className="flex min-w-0 items-center gap-2.5 rounded-md text-lg font-bold tracking-tight"
              >
                {lockup}
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
          </>
        )}
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        data-layout={layout}
        className={`mx-auto w-full flex-1 focus:outline-none ${
          layout === 'landing'
            ? ''
            : `px-4 py-8 sm:py-12 ${layout === 'wide' ? 'max-w-6xl' : 'max-w-3xl'}`
        }`}
      >
        <div key={location.pathname} className="animate-fade-in">
          <Outlet />
        </div>
      </main>

      {!focus && (
        <footer className="border-t border-rule bg-surface">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6">
            <div className="space-y-2">
              <QuizUpLogo size={22} />
              <p className="text-sm text-muted">Free and open source. Host it yourself.</p>
              <p className="text-sm text-muted">
                Need host access? Email{' '}
                <a
                  href={HOST_ACCESS_MAILTO}
                  className="font-medium text-board underline underline-offset-4"
                >
                  {HOST_ACCESS_CONTACT_EMAIL}
                </a>
              </p>
            </div>
            <SystemStatus />
          </div>
        </footer>
      )}
    </div>
  );
}
