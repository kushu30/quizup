import { useEffect, useId, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { HOST_ACCESS_CONTACT_EMAIL, HOST_ACCESS_MAILTO } from '../lib/contact';
import { BrandProvider, hasVisibleBrand, useBrand, useFocus } from '../lib/brandContext';
import { BrandMark } from './branding/BrandMark';
import { QuizUpLogo } from './brand/QuizUpLogo';
import { LANDING_SECTIONS, SOURCE_URL } from './landing/sections';
import { SiteHeader, type NavItem } from './landing/SiteHeader';
import { AppShell, SHELL_ICONS, type ShellItem } from './app/AppShell';
import { Texture } from './landing/Texture';
import { SystemStatus } from './SystemStatus';
import { ModernLookContext } from './app/shellContext';
import { ctaLight, ctaQuiet, ctaSize } from './landing/cta';

const WIDE_PREFIXES = ['/host', '/sessions/', '/admin'];
const AUTH_PATHS = ['/login'];
const APP_PATHS = ['/host', '/host/questions', '/host/groups', '/admin', '/me/results'];

// The quiz editor is a workspace of its own: its sidebar replaces the site header and footer.
// The pages under it, such as history, are not part of it.
function isWorkspacePath(pathname: string): boolean {
  return /^\/host\/quizzes\/[^/]+$/.test(pathname);
}

// Pages under a quiz or a session that sit inside the app, beside its sidebar.
function isSubPagePath(pathname: string): boolean {
  return (
    /^\/host\/quizzes\/[^/]+\/history$/.test(pathname) ||
    /^\/host\/sessions\/[^/]+$/.test(pathname) ||
    /^\/sessions\/[^/]+\/summary$/.test(pathname) ||
    /^\/sessions\/[^/]+\/students\/[^/]+$/.test(pathname) ||
    /^\/me\/results\/[^/]+$/.test(pathname)
  );
}

function isAuthPath(pathname: string): boolean {
  return AUTH_PATHS.includes(pathname) || pathname === '/join' || pathname.startsWith('/join/');
}

function isWidePath(pathname: string): boolean {
  return WIDE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

function barLinkClass({ isActive }: { isActive: boolean }) {
  return `inline-flex h-9 items-center rounded-[0.7rem] px-3 text-sm font-medium transition-colors duration-200 ease-soft ${
    isActive ? 'bg-night/[0.06] text-night' : 'text-night/60 hover:bg-night/[0.04] hover:text-night'
  }`;
}

// Students taking a quiz or exam: the page is only theirs, so there is nothing to leave by.
function isPlayPath(pathname: string): boolean {
  return pathname.startsWith('/play/');
}

export function Layout() {
  return (
    <ModernLookContext.Provider value>
      <BrandProvider>
        <LayoutFrame />
      </BrandProvider>
    </ModernLookContext.Provider>
  );
}

function LayoutFrame() {
  const { session, profile, canHost, isAdmin, signOut } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const layout =
    location.pathname === '/'
      ? 'landing'
      : isAuthPath(location.pathname)
        ? 'auth'
        : isWorkspacePath(location.pathname)
          ? 'workspace'
          : APP_PATHS.includes(location.pathname) || isSubPagePath(location.pathname)
            ? 'app'
            : isPlayPath(location.pathname)
              ? 'play'
              : isWidePath(location.pathname)
                ? 'wide'
                : 'focused';
  const { branding: brand, hero } = useBrand();
  const branded = hasVisibleBrand(brand);
  const focus = useFocus();
  // `modern` pages wear the redesigned chrome; `landing` is the one with the full marketing footer.
  const bare =
    layout === 'landing' ||
    layout === 'auth' ||
    layout === 'app' ||
    layout === 'workspace' ||
    layout === 'play';
  const modern = bare && !branded;
  const landing = layout === 'landing' && modern;
  const workspace = layout === 'workspace' && modern;
  const stacked =
    layout === 'auth' || layout === 'app' || layout === 'workspace' || layout === 'play';
  // The floating site header belongs to the pages that browse; students playing get a slim bar.
  const floating = modern && !focus && layout !== 'play';
  const slim = focus;
  // Hosts and admins work in the app shell, with a sidebar instead of the floating header.
  // Students keep the site header, since their results are the only page of theirs here.
  const shell =
    modern && Boolean(session) && canHost && (layout === 'app' || layout === 'workspace');

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  function isItemActive(item: NavItem, isActive: boolean): boolean {
    return isActive && !(item.yieldsTo && location.pathname.startsWith(item.yieldsTo));
  }

  const items: NavItem[] = [
    // Students join quizzes, signed in or not. Hosts and admins run them instead.
    ...(canHost ? [] : [{ to: '/join', label: 'Join a quiz' }]),
    ...(canHost
      ? [
          { to: '/host', label: 'Host', yieldsTo: '/host/groups' },
          { to: '/host/groups', label: 'Students' },
        ]
      : []),
    ...(isAdmin ? [{ to: '/admin', label: 'Admin' }] : []),
    ...(session ? [{ to: '/me/results', label: 'My results' }] : []),
  ];

  const shellItems: ShellItem[] = [
    {
      to: '/host',
      label: 'Quizzes',
      icon: SHELL_ICONS.quizzes,
      match: (path) =>
        path === '/host' ||
        path.startsWith('/host/quizzes/') ||
        path.startsWith('/host/sessions/') ||
        path.startsWith('/sessions/'),
    },
    {
      to: '/host/groups',
      label: 'Students',
      icon: SHELL_ICONS.students,
      match: (path) => path === '/host/groups',
    },
    {
      to: '/host/questions',
      label: 'Question bank',
      icon: SHELL_ICONS.questions,
      match: (path) => path === '/host/questions',
    },
    {
      to: '/me/results',
      label: 'My results',
      icon: SHELL_ICONS.results,
      match: (path) => path === '/me/results',
    },
    ...(isAdmin
      ? [
          {
            to: '/admin',
            label: 'Admin',
            icon: SHELL_ICONS.admin,
            match: (path: string) => path === '/admin',
          },
        ]
      : []),
  ];

  const lockup =
    branded && (!hero || focus) ? (
      <BrandMark branding={{ ...brand, tagline: undefined }} />
    ) : (
      <QuizUpLogo size={30} />
    );

  const mainElement = (
    <main
      id="main-content"
      tabIndex={-1}
      data-layout={layout}
      className={`mx-auto w-full flex-1 focus:outline-none ${stacked ? 'flex flex-col' : ''} ${
        bare ? '' : `px-4 py-8 sm:py-12 ${layout === 'wide' ? 'max-w-6xl' : 'max-w-3xl'}`
      }`}
    >
      <div
        key={location.pathname}
        className={`animate-fade-in ${stacked ? 'flex flex-1 flex-col' : ''}`}
      >
        <Outlet />
      </div>
    </main>
  );

  return (
    <div
      data-brand={branded ? 'true' : undefined}
      className="flex min-h-screen flex-col bg-canvas font-geist text-night"
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
      {!workspace && !shell && (
        <header
          className={
            floating
              ? 'sticky top-0 z-40 -mb-[4.25rem] h-[4.25rem] px-4 pt-3 sm:-mb-[4.5rem] sm:h-[4.5rem] sm:pt-4'
              : 'sticky top-0 z-40 border-b border-dashed border-night/15 bg-white/80 backdrop-blur-md'
          }
        >
          {branded && (
            <div
              data-testid="brand-stripe"
              aria-hidden="true"
              className="h-1"
              style={{ backgroundColor: brand.brandColor ?? '#1e5446' }}
            />
          )}
          {slim ? (
            <div className="mx-auto flex min-h-12 max-w-6xl items-center gap-2.5 px-4 py-1.5">
              {lockup}
            </div>
          ) : floating ? (
            <SiteHeader
              page={landing ? 'landing' : layout === 'app' ? 'app' : 'auth'}
              items={items}
              signedIn={Boolean(session)}
              onSignOut={() => void signOut()}
              menuId={menuId}
              menuOpen={menuOpen}
              setMenuOpen={setMenuOpen}
            />
          ) : (
            <>
              <div className="mx-auto flex min-h-14 max-w-6xl items-center justify-between gap-4 px-4 py-1.5">
                <Link to="/" className="flex min-w-0 items-center gap-2.5 rounded-md">
                  {lockup}
                </Link>

                <nav aria-label="Primary" className="hidden flex-1 md:block">
                  <ul className="flex items-center justify-end gap-1">
                    {items.map((item) => (
                      <li key={item.to}>
                        <NavLink
                          to={item.to}
                          className={({ isActive }) =>
                            barLinkClass({ isActive: isItemActive(item, isActive) })
                          }
                        >
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
                      className={`${ctaQuiet} ${ctaSize.sm}`}
                    >
                      Sign out
                    </button>
                  ) : (
                    <Link to="/login" className={`${ctaLight} ${ctaSize.sm}`}>
                      Log in
                    </Link>
                  )}
                </div>

                <button
                  type="button"
                  aria-expanded={menuOpen}
                  aria-controls={menuId}
                  onClick={() => setMenuOpen((open) => !open)}
                  className={`${ctaLight} ${ctaSize.sm} md:hidden`}
                >
                  Menu
                </button>
              </div>

              <div
                id={menuId}
                hidden={!menuOpen}
                className="border-t border-dashed border-night/15 px-4 pt-2 pb-4 md:hidden"
              >
                <ul className="space-y-1">
                  {items.map((item) => (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        className={({ isActive }) =>
                          `${barLinkClass({ isActive: isItemActive(item, isActive) })} flex h-11 w-full`
                        }
                        onClick={() => setMenuOpen(false)}
                      >
                        {item.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 border-t border-dashed border-night/15 pt-3">
                  {session ? (
                    <button
                      type="button"
                      onClick={() => void signOut()}
                      className={`${ctaLight} ${ctaSize.md} w-full`}
                    >
                      Sign out
                    </button>
                  ) : (
                    <Link
                      to="/login"
                      onClick={() => setMenuOpen(false)}
                      className={`${ctaLight} ${ctaSize.md} w-full`}
                    >
                      Log in
                    </Link>
                  )}
                </div>
              </div>
            </>
          )}
        </header>
      )}

      {shell ? (
        <AppShell
          items={shellItems}
          account={profile?.name || profile?.email || 'Signed in'}
          onSignOut={() => void signOut()}
        >
          {mainElement}
        </AppShell>
      ) : (
        mainElement
      )}

      {!focus && !shell && landing && <LandingFooter items={items} signedIn={Boolean(session)} />}
      {!focus && !landing && !workspace && !shell && layout !== 'play' && <CompactFooter />}
    </div>
  );
}

const FOOTER_LINK = 'text-[0.9375rem] text-white/55 transition-colors hover:text-white';
const FOOTER_RAIL = 'border-dashed border-white/15';

// The landing page footer: the same dashed rails as the page, link columns, and the name
// set large in dither at the very bottom, lit up around the pointer.
function LandingFooter({ items, signedIn }: { items: NavItem[]; signedIn: boolean }) {
  return (
    <footer className="overflow-hidden bg-night text-white xl:px-6">
      <div className={`mx-auto max-w-[86rem] xl:border-x ${FOOTER_RAIL}`}>
        <div className={`mx-auto max-w-6xl px-4 sm:border-x sm:px-10 ${FOOTER_RAIL}`}>
          <div className="grid grid-cols-2 gap-x-6 gap-y-12 pt-20 pb-16 md:grid-cols-4 md:gap-x-10">
            <FooterColumn title="Product">
              {items.map((item) => (
                <li key={item.to}>
                  <Link to={item.to} className={FOOTER_LINK}>
                    {item.label}
                  </Link>
                </li>
              ))}
              {!signedIn && (
                <li>
                  <Link to="/login" className={FOOTER_LINK}>
                    Log in
                  </Link>
                </li>
              )}
            </FooterColumn>
            <FooterColumn title="On this page">
              {LANDING_SECTIONS.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`} className={FOOTER_LINK}>
                    {section.label}
                  </a>
                </li>
              ))}
            </FooterColumn>
            <FooterColumn title="Project">
              <li>
                <a href={SOURCE_URL} className={FOOTER_LINK}>
                  Source on GitHub
                </a>
              </li>
            </FooterColumn>
            <FooterColumn title="Host access">
              <li>
                <a href={HOST_ACCESS_MAILTO} className={`${FOOTER_LINK} break-words`}>
                  {HOST_ACCESS_CONTACT_EMAIL}
                </a>
              </li>
            </FooterColumn>
          </div>
          <div
            className={`flex flex-wrap items-center justify-between gap-4 border-t py-6 text-sm text-white/50 ${FOOTER_RAIL}`}
          >
            <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <QuizUpLogo size={22} tone="onDark" />
              Free and open source. Host it yourself.
            </span>
            <SystemStatus />
          </div>
          <div
            aria-hidden="true"
            className={`relative -mx-4 h-[clamp(6rem,23vw,18rem)] border-t sm:-mx-10 ${FOOTER_RAIL}`}
          >
            <Texture
              field="text"
              text="QuizUp"
              color="var(--color-accent-500)"
              highlight="var(--color-accent-200)"
              cell={4}
              interactive
            />
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className={`border-b pb-3 text-[0.9375rem] font-medium text-white ${FOOTER_RAIL}`}>
        {title}
      </p>
      <ul className="mt-4 space-y-2.5">{children}</ul>
    </div>
  );
}

// A slim footer for the pages around the landing page, in the same dashed frame.
function CompactFooter() {
  return (
    <footer className="border-t border-dashed border-night/15 bg-canvas">
      <div className="mx-auto max-w-6xl px-4 sm:border-x sm:border-dashed sm:border-night/15 sm:px-10">
        <div className="flex flex-wrap items-center justify-between gap-4 py-6 text-sm text-night/50">
          <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <QuizUpLogo size={22} />
            Free and open source. Host it yourself.
          </span>
          <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span>
              Need host access?{' '}
              <a
                href={HOST_ACCESS_MAILTO}
                className="font-medium text-night/70 underline decoration-night/20 underline-offset-4 transition-colors hover:text-night hover:decoration-night"
              >
                {HOST_ACCESS_CONTACT_EMAIL}
              </a>
            </span>
            <SystemStatus />
          </span>
        </div>
      </div>
    </footer>
  );
}
