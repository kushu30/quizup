// Buttons for the redesigned pages, after Shotbase: softly rounded corners (not full pills),
// a solid fill in the brand green with an inner top highlight and a thin edge, and a small
// press on click.
// Every state change uses the same easing so hovers feel calm rather than jumpy.
const BUTTON =
  'inline-flex items-center justify-center gap-2 rounded-[0.8rem] font-medium whitespace-nowrap select-none transition-[background-color,box-shadow,color,filter,transform] duration-200 ease-soft active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:brightness-100 disabled:active:scale-100';

export const ctaPrimary = `${BUTTON} bg-gradient-to-b from-accent-500 to-accent-600 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3),inset_0_-1px_0_rgba(0,0,0,0.1),0_0_0_1px_var(--color-accent-700),0_1px_2px_rgba(17,16,20,0.16)] hover:brightness-[1.06] focus-visible:outline-accent-500`;

// A solid button whose colour comes from an inline style, for an institution's own colour.
export const ctaSolid = `${BUTTON} shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-1px_0_rgba(0,0,0,0.12),0_1px_2px_rgba(17,16,20,0.16)] hover:brightness-[1.06] focus-visible:outline-night`;

export const ctaDark = `${BUTTON} bg-gradient-to-b from-[#2a2930] to-night text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_0_0_1px_rgba(0,0,0,0.6),0_1px_2px_rgba(17,16,20,0.2)] hover:brightness-125 focus-visible:outline-night`;

export const ctaLight = `${BUTTON} bg-white text-night shadow-[0_0_0_1px_rgba(17,16,20,0.11),0_1px_2px_rgba(17,16,20,0.05)] hover:shadow-[0_0_0_1px_rgba(17,16,20,0.2),0_1px_2px_rgba(17,16,20,0.05)] focus-visible:outline-night`;

// Quiet buttons for the secondary actions in a row of buttons.
export const ctaQuiet = `${BUTTON} text-night/60 hover:bg-night/[0.05] hover:text-night focus-visible:outline-night`;

export const ctaQuietDanger = `${BUTTON} text-night/45 hover:bg-alert-soft hover:text-alert focus-visible:outline-alert`;

// A tinted button for a live action, matching the Live now badge.
export const ctaSoft = `${BUTTON} bg-accent-50 text-accent-800 shadow-[inset_0_0_0_1px_var(--color-accent-200)] hover:bg-accent-100 focus-visible:outline-accent-600`;

export const ctaDanger = `${BUTTON} bg-gradient-to-b from-[#c8372b] to-alert text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_0_0_1px_#931c13,0_1px_2px_rgba(17,16,20,0.16)] hover:brightness-[1.06] focus-visible:outline-alert`;

export const ctaSize = {
  sm: 'h-9 px-3.5 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-5 text-[0.9375rem]',
};
