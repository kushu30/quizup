import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AppIcon } from './app/icons';
import { JoinQr } from './JoinQr';
import { ctaLight, ctaSize } from './landing/cta';

interface JoinQrZoomProps {
  url: string;
  code: string;
  /** Words shown under the QR, such as "Click to enlarge". */
  hint?: string;
}

function FullScreenQr({
  url,
  code,
  onClose,
}: Omit<JoinQrZoomProps, 'hint'> & { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return createPortal(
    // Tapping anywhere closes it, which is what you want when it is on a projector or a phone.
    // The Close button and Escape are the keyboard routes.
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Join QR code"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
      className="fixed inset-0 z-[60] flex animate-fade-in cursor-zoom-out flex-col items-center justify-center gap-[3vmin] bg-white p-6 font-geist text-night"
    >
      <button
        ref={closeRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        className={`${ctaLight} ${ctaSize.md} absolute top-4 right-4`}
      >
        <AppIcon size={16}>
          <path d="M18 6 6 18M6 6l12 12" />
        </AppIcon>
        Close
      </button>
      <div className="w-[min(78vmin,44rem)] overflow-hidden rounded-[1.5rem] shadow-[0_0_0_1px_rgba(17,16,20,0.1),0_24px_60px_-24px_rgba(17,16,20,0.4)]">
        <JoinQr url={url} />
      </div>
      <p className="font-geist-mono text-[clamp(2.25rem,11vmin,7rem)] leading-none font-medium tracking-[0.18em] select-all">
        {code}
      </p>
      <p className="text-[clamp(1rem,3vmin,1.75rem)] text-night/60">
        {url.replace(/^https?:\/\//, '')}
      </p>
    </div>,
    document.body,
  );
}

/** The join QR, which opens a full-screen view for a projector or a back-row student when clicked. */
export function JoinQrZoom({ url, code, hint }: JoinQrZoomProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Show the join QR code full screen"
        onClick={() => setOpen(true)}
        className="group relative block w-full cursor-zoom-in focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
      >
        <JoinQr url={url} />
        <span
          aria-hidden="true"
          data-testid="enlarge-icon"
          className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-md bg-night/80 text-white shadow-sm transition-transform duration-200 ease-soft group-hover:scale-110"
        >
          <AppIcon size={14}>
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
          </AppIcon>
        </span>
        {hint && (
          <span className="mt-1.5 block pb-0.5 text-center text-xs font-medium text-night/70">
            {hint}
          </span>
        )}
      </button>
      {open && <FullScreenQr url={url} code={code} onClose={close} />}
    </>
  );
}
