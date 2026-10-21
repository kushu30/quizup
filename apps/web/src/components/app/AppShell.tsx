import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { QuizUpLogo } from '../brand/QuizUpLogo';
import { Tooltip } from '../ui/Tooltip';
import { initialsOf } from '../branding/BrandMark';
import { Texture } from '../landing/Texture';
import { AppIcon, ICONS } from './icons';
import { InShellContext } from './shellContext';

export interface ShellItem {
  to: string;
  label: string;
  icon: ReactNode;
  // Which paths count as this section, such as the dashboard and the quiz editors under it.
  match: (pathname: string) => boolean;
}

export const SHELL_ICONS = {
  quizzes: <AppIcon>{ICONS.dashboard}</AppIcon>,
  questions: <AppIcon>{ICONS.library}</AppIcon>,
  results: <AppIcon>{ICONS.results}</AppIcon>,
  admin: <AppIcon>{ICONS.shield}</AppIcon>,
};

const SIGN_OUT_ICON = <AppIcon>{ICONS.signOut}</AppIcon>;

// The signed-in app for hosts and admins: a dark sidebar with the workspace sections and the
// account, in place of the floating site header. It is always open on wide screens; on phones
// it slides in from a top bar.
export function AppShell({
  items,
  account,
  onSignOut,
  children,
}: {
  items: ShellItem[];
  account: string;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setDrawerOpen(false);
        toggleRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  return (
    <InShellContext.Provider value={true}>
      <div className="flex min-h-screen flex-1">
        <div className="hidden w-[16.5rem] shrink-0 p-3 pr-0 lg:block">
          <aside
            aria-label="Workspace"
            className="sticky top-3 z-20 flex h-[calc(100vh-1.5rem)] flex-col overflow-hidden rounded-[1.25rem] bg-night text-white shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_16px_40px_-20px_rgba(17,16,20,0.55)]"
          >
            <SidebarBody items={items} account={account} onSignOut={onSignOut} />
          </aside>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="sticky top-0 z-30 px-3 pt-3 lg:hidden">
            <div className="flex h-14 items-center justify-between rounded-[1.1rem] bg-night/95 pr-2 pl-4 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_12px_32px_-12px_rgba(17,16,20,0.5)] backdrop-blur-md">
              <Link to="/" aria-label="QuizUp home">
                <QuizUpLogo size={24} tone="onDark" />
              </Link>
              <button
                ref={toggleRef}
                type="button"
                aria-expanded={drawerOpen}
                aria-controls={drawerId}
                onClick={() => setDrawerOpen((open) => !open)}
                className="flex h-10 items-center rounded-[0.8rem] bg-white/10 px-3.5 text-sm font-medium text-white transition-colors duration-200 ease-soft hover:bg-white/15"
              >
                Menu
              </button>
            </div>
          </div>
          {children}
        </div>

        <div
          className={`fixed inset-0 z-50 lg:hidden ${drawerOpen ? '' : 'pointer-events-none'}`}
          aria-hidden={!drawerOpen}
        >
          <div
            onClick={() => setDrawerOpen(false)}
            className={`absolute inset-0 bg-night/30 transition-opacity duration-300 ease-soft ${
              drawerOpen ? 'opacity-100' : 'opacity-0'
            }`}
          />
          <div
            id={drawerId}
            className={`absolute inset-y-3 left-3 flex w-72 max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-[1.25rem] bg-night text-white shadow-[0_24px_48px_-12px_rgba(17,16,20,0.5)] transition-[translate,visibility] duration-300 ease-soft ${
              drawerOpen ? 'visible translate-x-0' : 'invisible -translate-x-[calc(100%+1rem)]'
            }`}
          >
            <SidebarBody items={items} account={account} onSignOut={onSignOut} />
          </div>
        </div>
      </div>
    </InShellContext.Provider>
  );
}

function SidebarBody({
  items,
  account,
  onSignOut,
}: {
  items: ShellItem[];
  account: string;
  onSignOut: () => void;
}) {
  const { pathname } = useLocation();
  return (
    <>
      <div className="flex h-16 shrink-0 items-center px-5">
        <Link to="/" aria-label="QuizUp home" className="inline-flex items-center">
          <QuizUpLogo size={26} tone="onDark" />
        </Link>
      </div>

      <nav
        aria-label="Primary"
        className="w-full flex-1 border-t border-dashed border-white/10 px-3 pt-3"
      >
        <p className="px-3 pb-2 text-xs font-medium text-white/35">Workspace</p>
        <ul className="space-y-1">
          {items.map((item) => {
            const current = item.match(pathname);
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  aria-current={current ? 'page' : undefined}
                  className={`flex h-10 items-center gap-3 rounded-[0.7rem] px-3 text-sm transition-colors duration-200 ease-soft ${
                    current
                      ? 'bg-white/10 font-medium text-white'
                      : 'text-white/55 hover:bg-white/[0.05] hover:text-white'
                  }`}
                >
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div aria-hidden="true" className="pointer-events-none relative h-24 w-full shrink-0">
        <Texture field="rise" color="var(--color-accent-400)" opacity={0.32} cell={3} />
      </div>
      <div className="relative shrink-0 border-t border-dashed border-white/10 px-3 py-3">
        <div className="relative flex items-center gap-2 pl-2">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-medium text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]"
          >
            {initialsOf(account) || '·'}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm text-white/75" title={account}>
            {account}
          </span>
          <Tooltip label="Sign out">
            <button
              type="button"
              onClick={onSignOut}
              aria-label="Sign out"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.7rem] text-white/50 transition-colors duration-200 ease-soft hover:bg-white/10 hover:text-white"
            >
              {SIGN_OUT_ICON}
            </button>
          </Tooltip>
        </div>
      </div>
    </>
  );
}
