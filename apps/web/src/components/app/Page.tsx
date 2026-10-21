import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Frame, RULE } from '../landing/frame';
import { AppIcon, ICONS } from './icons';

// The shape every app page shares, after the landing page: a header on the woven texture of
// the hero, then the page itself on white, both inside the same dashed rails.

// Full-width bands (the header texture, the figures strips, the white body) run under the
// floating sidebar to the left edge of the screen, so the page reads as one surface behind it.
export const BLEED = 'lg:-ml-[16.5rem] lg:pl-[16.5rem]';

export function PageHeader({
  title,
  description,
  back,
  actions,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  // The page this one sits under, shown as a link above the title: `label` names that page.
  back?: { to: string; label: string };
  actions?: ReactNode;
  // Anything under the title row, such as a notice.
  children?: ReactNode;
}) {
  return (
    <div className={`texture-weave border-b ${RULE} ${BLEED}`}>
      <Frame className="pt-14 pb-8 sm:pt-16">
        {back && (
          <Link
            to={back.to}
            aria-label={`Back to ${back.label}`}
            className="group absolute top-4 left-4 inline-flex h-8 max-w-[calc(100%-2rem)] items-center gap-1.5 rounded-[0.7rem] pr-3 pl-2 text-sm text-night/55 transition-colors duration-200 ease-soft hover:bg-night/[0.05] hover:text-night sm:top-5 sm:left-8"
          >
            <AppIcon
              size={15}
              className="transition-transform duration-200 ease-soft group-hover:-translate-x-0.5"
            >
              {ICONS.back}
            </AppIcon>
            <span className="truncate">{back.label}</span>
          </Link>
        )}
        <div className="flex flex-col gap-5 lg:min-h-[5.5rem] lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-[2rem] leading-tight font-medium tracking-[-0.035em] break-words sm:text-[2.5rem]">
              {title}
            </h1>
            {description && (
              <div className="mt-2 max-w-2xl text-[0.9375rem] leading-relaxed text-night/55">
                {description}
              </div>
            )}
          </div>
          {actions}
        </div>
        {children}
      </Frame>
    </div>
  );
}

export function PageBody({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-1 flex-col bg-white ${BLEED}`}>
      <Frame flush className={`flex flex-1 flex-col pb-20 ${className}`}>
        {children}
      </Frame>
    </div>
  );
}
