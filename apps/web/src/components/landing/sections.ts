// The landing page sections the header and footer link to. The ids are set on the sections.
export const LANDING_SECTIONS = [
  { id: 'modes', label: 'Modes' },
  { id: 'exams', label: 'Exams' },
  { id: 'how-it-works', label: 'How it works' },
  { id: 'classroom', label: 'Classroom' },
];

export const SOURCE_URL = 'https://github.com/kushu30/quizup';

// Glides to a landing page section instead of jumping, unless the visitor prefers less motion.
export function scrollToSection(id: string): boolean {
  const target = document.getElementById(id);
  if (!target || typeof target.scrollIntoView !== 'function') {
    return false;
  }
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
  return true;
}

// Glides back to the top of the page, unless the visitor prefers less motion.
export function scrollToTop(): void {
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: 0, behavior: still ? 'auto' : 'smooth' });
}
