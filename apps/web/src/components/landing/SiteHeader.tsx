import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
} from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { QuizUpLogo } from '../brand/QuizUpLogo';
import { ctaPrimary, ctaSize } from './cta';
import {
  IconAdaptive,
  IconBrand,
  IconHistory,
  IconProctor,
  IconQuestions,
  IconResults,
  IconShare,
  IconTimer,
  IconToken,
} from './icons';
import { SOURCE_URL, scrollToSection } from './sections';

export interface NavItem {
  to: string;
  label: string;
}

type Tone = 'sky' | 'violet' | 'amber' | 'rose' | 'teal' | 'lime';

// Tinted cards on the dark menu, one colour each, after Shotbase's feature menu.
const TONES: Record<Tone, { card: string; chip: string }> = {
  sky: { card: 'bg-sky-400/[0.1] hover:bg-sky-400/[0.16]', chip: 'bg-sky-300' },
  violet: { card: 'bg-violet-400/[0.12] hover:bg-violet-400/[0.19]', chip: 'bg-violet-300' },
  amber: { card: 'bg-amber-400/[0.1] hover:bg-amber-400/[0.16]', chip: 'bg-amber-300' },
  rose: { card: 'bg-rose-400/[0.1] hover:bg-rose-400/[0.16]', chip: 'bg-rose-300' },
  teal: { card: 'bg-teal-400/[0.1] hover:bg-teal-400/[0.16]', chip: 'bg-teal-300' },
  lime: { card: 'bg-lime-400/[0.09] hover:bg-lime-400/[0.15]', chip: 'bg-lime-300' },
};

interface MenuEntry {
  title: string;
  body: string;
  tone: Tone;
  icon: ComponentType;
}

const FEATURES: (MenuEntry & { section: string })[] = [
  {
    section: 'modes',
    title: 'Live quiz',
    body: 'The whole room on one question, in real time.',
    tone: 'sky',
    icon: IconResults,
  },
  {
    section: 'modes',
    title: 'Adaptive quiz',
    body: 'Questions matched to each student’s level.',
    tone: 'violet',
    icon: IconAdaptive,
  },
  {
    section: 'modes',
    title: 'Timed exam',
    body: 'A private timer, with results you release.',
    tone: 'amber',
    icon: IconTimer,
  },
  {
    section: 'exams',
    title: 'Proctoring',
    body: 'Optional signals, and students are told first.',
    tone: 'rose',
    icon: IconProctor,
  },
  {
    section: 'how-it-works',
    title: 'How it works',
    body: 'From the first question to the final report.',
    tone: 'teal',
    icon: IconShare,
  },
  {
    section: 'classroom',
    title: 'Classroom',
    body: 'Your branding, feedback, history and exports.',
    tone: 'lime',
    icon: IconBrand,
  },
];

// The signed-in pages, described for the Workspace menu.
const WORKSPACE: Record<string, Omit<MenuEntry, 'title'>> = {
  '/host': { body: 'Your quizzes and live sessions.', tone: 'lime', icon: IconQuestions },
  '/host/questions': { body: 'Every question you have written.', tone: 'violet', icon: IconShare },
  '/admin': { body: 'Choose who can host.', tone: 'amber', icon: IconToken },
  '/me/results': { body: 'Scores from quizzes you took.', tone: 'sky', icon: IconHistory },
};

type MenuKey = 'features' | 'workspace';

function linkClass(active = false) {
  return `inline-flex h-10 items-center gap-1.5 rounded-[0.7rem] px-3 text-sm font-medium transition-colors duration-200 ease-soft ${
    active ? 'bg-white/[0.08] text-white' : 'text-white/65 hover:bg-white/[0.06] hover:text-white'
  }`;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      className={`transition-transform duration-300 ease-soft ${open ? 'rotate-180' : ''}`}
    >
      <path
        d="m3 4.5 3 3 3-3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MenuCard({
  to,
  entry,
  onSelect,
}: {
  to: string | { pathname: string; hash: string };
  entry: MenuEntry;
  onSelect: () => void;
}) {
  const titleId = useId();
  const bodyId = useId();
  const tone = TONES[entry.tone];
  const Icon = entry.icon;
  return (
    <Link
      to={to}
      onClick={onSelect}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      className={`group flex flex-col gap-3 rounded-[0.9rem] p-4 transition-colors duration-200 ease-soft focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white ${tone.card}`}
    >
      <span
        aria-hidden="true"
        style={{ '--icon-accent': '#111014' } as CSSProperties}
        className={`flex h-8 w-8 items-center justify-center rounded-[0.6rem] text-night [&_svg]:h-[18px] [&_svg]:w-[18px] ${tone.chip}`}
      >
        <Icon />
      </span>
      <span>
        <span id={titleId} className="block text-[0.9375rem] font-medium text-white">
          {entry.title}
        </span>
        <span id={bodyId} className="mt-1 block text-[0.8125rem] leading-snug text-white/55">
          {entry.body}
        </span>
      </span>
    </Link>
  );
}

interface SiteHeaderProps {
  // Which redesigned page this is: the landing page, a page around it (sign in, join), or a
  // signed-in workspace page.
  page: 'landing' | 'auth' | 'app';
  items: NavItem[];
  signedIn: boolean;
  onSignOut: () => void;
  menuId: string;
  menuOpen: boolean;
  setMenuOpen: (update: (open: boolean) => boolean) => void;
}

const MENU_ORDER: MenuKey[] = ['features', 'workspace'];
const MENU_MIN_WIDTH = 640;
const BAR_GAP = 24;

interface MenuView {
  open: MenuKey | null;
  // The menu whose cards are in place, kept while the bar closes so nothing jumps.
  shown: MenuKey | null;
  // True when going straight from one open menu to the other, which slides the cards across.
  swipe: boolean;
}

// The floating dark header, after Shotbase. On the landing and sign-in pages, Features (and
// Workspace when signed in) open menus that grow the bar downwards. On the workspace pages the
// same links sit in the bar as tabs. The bar eases to the width of whatever it holds.
export function SiteHeader({
  page,
  items,
  signedIn,
  onSignOut,
  menuId,
  menuOpen,
  setMenuOpen,
}: SiteHeaderProps) {
  const location = useLocation();
  const rootRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLAnchorElement>(null);
  const centreRef = useRef<HTMLUListElement>(null);
  const rightRef = useRef<HTMLUListElement>(null);
  const featuresRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // When a hover has just opened a menu, the click that follows should not close it again.
  const hoverOpenedAt = useRef(0);
  const [view, setView] = useState<MenuView>({ open: null, shown: null, swipe: false });
  const [heights, setHeights] = useState<Record<MenuKey, number>>({ features: 0, workspace: 0 });
  const [barWidth, setBarWidth] = useState<number | null>(null);
  const featuresId = useId();
  const workspaceId = useId();
  const open = view.open;

  const join = items.find((item) => item.to === '/join');
  const pages = items.filter((item) => item.to !== '/join');
  const workspace = pages;
  // The Workspace menu also offers the question bank, so its cards stay in even pairs. The
  // tabs on the workspace pages leave it out; it is linked from the dashboard there.
  const workspaceMenu: NavItem[] = pages.flatMap((item) =>
    item.to === '/host' ? [item, { to: '/host/questions', label: 'Question bank' }] : [item],
  );
  const tabs = page === 'app';
  const showFeatures = !tabs;
  const showWorkspace = !tabs && workspace.length > 0;
  const hasMenus = showFeatures || showWorkspace;

  function show(next: MenuKey | null) {
    setView((current) =>
      current.open === next
        ? current
        : {
            open: next,
            shown: next ?? current.shown,
            swipe: current.open !== null && next !== null,
          },
    );
  }

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        show(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        show(null);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    show(null);
  }, [location.pathname]);

  useEffect(
    () => () => {
      if (closeTimer.current) {
        clearTimeout(closeTimer.current);
      }
    },
    [],
  );

  // Measures the menus (for the bar's height) and the bar's contents (for its width).
  useLayoutEffect(() => {
    const measure = () => {
      setHeights({
        features: featuresRef.current?.offsetHeight ?? 0,
        workspace: workspaceRef.current?.offsetHeight ?? 0,
      });
      const logo = logoRef.current?.offsetWidth ?? 0;
      const centre = centreRef.current?.offsetWidth ?? 0;
      const right = rightRef.current?.offsetWidth ?? 0;
      if (logo || centre || right) {
        // The centre group sits in the middle, so both sides need room for the wider one.
        const side = Math.max(16 + logo, right + 6);
        const natural = Math.ceil(centre + 2 * side + 2 * BAR_GAP);
        setBarWidth(hasMenus ? Math.max(natural, MENU_MIN_WIDTH) : natural);
      }
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(measure);
    for (const node of [
      featuresRef.current,
      workspaceRef.current,
      logoRef.current,
      centreRef.current,
      rightRef.current,
    ]) {
      if (node) {
        observer.observe(node);
      }
    }
    return () => observer.disconnect();
  }, [hasMenus, showFeatures, showWorkspace, workspace.length]);

  function hoverOpen(key: MenuKey, pointerType: string) {
    if (pointerType !== 'mouse') {
      return;
    }
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
    }
    if (open !== key) {
      hoverOpenedAt.current = Date.now();
    }
    show(key);
  }

  function toggle(key: MenuKey) {
    const justHovered = Date.now() - hoverOpenedAt.current < 600;
    hoverOpenedAt.current = 0;
    show(open === key && !justHovered ? null : key);
  }

  function hoverClose(pointerType: string) {
    if (pointerType !== 'mouse') {
      return;
    }
    closeTimer.current = setTimeout(() => show(null), 160);
  }

  function goToSection(section: string) {
    show(null);
    setMenuOpen(() => false);
    if (location.pathname === '/') {
      scrollToSection(section);
    }
  }

  // Each menu sits to one side of the one in place. Going from one open menu to the other
  // slides both across together, like a carousel; opening and closing never slide.
  function panelClass(key: MenuKey) {
    const shownIndex = MENU_ORDER.indexOf(view.shown ?? 'features');
    const index = MENU_ORDER.indexOf(key);
    const place =
      index === shownIndex
        ? `translate-x-0 ${open ? 'visible' : 'invisible'}`
        : `invisible ${index < shownIndex ? '-translate-x-full' : 'translate-x-full'}`;
    const motion = view.swipe
      ? 'transition-[translate,visibility] duration-[460ms] ease-soft'
      : 'transition-[visibility] duration-[420ms]';
    return `absolute inset-x-0 top-0 grid grid-cols-2 gap-1.5 px-1.5 pb-1.5 ${motion} ${place}`;
  }

  return (
    <div className="mx-auto w-full max-w-6xl sm:w-fit">
      <div
        ref={rootRef}
        style={{ '--bar-w': barWidth ? `${barWidth}px` : '40rem' } as CSSProperties}
        className="relative overflow-hidden rounded-[1.1rem] bg-night/95 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_12px_32px_-12px_rgba(17,16,20,0.5)] backdrop-blur-md transition-[width] duration-[420ms] ease-soft md:w-[var(--bar-w)]"
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse' && closeTimer.current) {
            clearTimeout(closeTimer.current);
          }
        }}
        onPointerLeave={(event) => hoverClose(event.pointerType)}
      >
        <div className="relative flex h-[3.25rem] items-center justify-between gap-6 p-1.5 pl-4">
          <Link ref={logoRef} to="/" className="flex shrink-0 items-center rounded-lg">
            <QuizUpLogo size={24} tone="onDark" />
          </Link>

          <nav aria-label="Primary" className="hidden md:block">
            <ul
              ref={centreRef}
              className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-0.5 whitespace-nowrap"
            >
              {showFeatures && (
                <li>
                  <button
                    type="button"
                    aria-expanded={open === 'features'}
                    aria-controls={featuresId}
                    onPointerEnter={(event) => hoverOpen('features', event.pointerType)}
                    onClick={() => toggle('features')}
                    className={linkClass(open === 'features')}
                  >
                    Features
                    <Chevron open={open === 'features'} />
                  </button>
                </li>
              )}
              {showWorkspace && (
                <li>
                  <button
                    type="button"
                    aria-expanded={open === 'workspace'}
                    aria-controls={workspaceId}
                    onPointerEnter={(event) => hoverOpen('workspace', event.pointerType)}
                    onClick={() => toggle('workspace')}
                    className={linkClass(open === 'workspace')}
                  >
                    Workspace
                    <Chevron open={open === 'workspace'} />
                  </button>
                </li>
              )}
              {tabs &&
                workspace.map((item) => (
                  <li key={item.to}>
                    <NavLink to={item.to} className={({ isActive }) => linkClass(isActive)}>
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              {page === 'landing' && !signedIn && (
                <li>
                  <a href={SOURCE_URL} className={linkClass()}>
                    Open source
                  </a>
                </li>
              )}
            </ul>
            <ul ref={rightRef} className="flex items-center gap-0.5 whitespace-nowrap">
              {signedIn ? (
                <li>
                  <button type="button" onClick={onSignOut} className={linkClass()}>
                    Sign out
                  </button>
                </li>
              ) : (
                page === 'landing' && (
                  <li>
                    <Link to="/login" className={linkClass()}>
                      Log in
                    </Link>
                  </li>
                )
              )}
              {join && (
                <li className={tabs ? '' : 'pl-1'}>
                  {tabs ? (
                    <NavLink to={join.to} className={({ isActive }) => linkClass(isActive)}>
                      {join.label}
                    </NavLink>
                  ) : (
                    <NavLink to={join.to} className={`${ctaPrimary} ${ctaSize.md}`}>
                      {join.label}
                    </NavLink>
                  )}
                </li>
              )}
            </ul>
          </nav>

          <button
            type="button"
            aria-expanded={menuOpen}
            aria-controls={menuId}
            onClick={() => setMenuOpen((current) => !current)}
            className="ml-auto inline-flex h-10 items-center rounded-[0.7rem] bg-white/10 px-4 text-sm font-medium text-white transition-colors duration-200 ease-soft hover:bg-white/15 md:hidden"
          >
            Menu
          </button>
        </div>

        {hasMenus && (
          <div
            className="relative hidden overflow-hidden transition-[height] duration-[420ms] ease-soft md:block"
            style={{ height: open ? heights[open] : 0 }}
          >
            {showFeatures && (
              <div ref={featuresRef} id={featuresId} className={panelClass('features')}>
                {FEATURES.map((entry) => (
                  <MenuCard
                    key={entry.title}
                    to={{ pathname: '/', hash: `#${entry.section}` }}
                    entry={entry}
                    onSelect={() => goToSection(entry.section)}
                  />
                ))}
              </div>
            )}
            {showWorkspace && (
              <div ref={workspaceRef} id={workspaceId} className={panelClass('workspace')}>
                {workspaceMenu.map((item) => {
                  const described = WORKSPACE[item.to];
                  return described ? (
                    <MenuCard
                      key={item.to}
                      to={item.to}
                      entry={{ ...described, title: item.label }}
                      onSelect={() => show(null)}
                    />
                  ) : null;
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <div
        id={menuId}
        hidden={!menuOpen}
        className="mt-2 origin-top animate-pop rounded-[1.25rem] bg-night p-2 text-white shadow-[0_24px_48px_-16px_rgba(17,16,20,0.55)] md:hidden"
      >
        {showFeatures && (
          <ul className="grid grid-cols-2 gap-1.5 border-b border-white/10 pb-2">
            {FEATURES.map((entry) => {
              const Icon = entry.icon;
              return (
                <li key={entry.title}>
                  <Link
                    to={{ pathname: '/', hash: `#${entry.section}` }}
                    onClick={() => goToSection(entry.section)}
                    className={`flex items-center gap-2.5 rounded-[0.8rem] p-2.5 text-sm font-medium text-white transition-colors duration-200 ease-soft ${TONES[entry.tone].card}`}
                  >
                    <span
                      aria-hidden="true"
                      style={{ '--icon-accent': '#111014' } as CSSProperties}
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[0.5rem] text-night [&_svg]:h-4 [&_svg]:w-4 ${TONES[entry.tone].chip}`}
                    >
                      <Icon />
                    </span>
                    {entry.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <ul className="mt-2 space-y-0.5">
          {items.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                onClick={() => setMenuOpen(() => false)}
                className={({ isActive }) =>
                  `block rounded-[0.8rem] px-4 py-3 text-base font-medium transition-colors duration-200 ease-soft ${
                    isActive ? 'bg-white/10 text-white' : 'text-white/75 hover:bg-white/5'
                  }`
                }
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
        {(signedIn || page === 'landing') && (
          <div className="mt-2 border-t border-white/10 pt-2">
            {signedIn ? (
              <button
                type="button"
                onClick={onSignOut}
                className={`${ctaPrimary} ${ctaSize.lg} w-full`}
              >
                Sign out
              </button>
            ) : (
              <Link
                to="/login"
                onClick={() => setMenuOpen(() => false)}
                className={`${ctaPrimary} ${ctaSize.lg} w-full`}
              >
                Log in
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
