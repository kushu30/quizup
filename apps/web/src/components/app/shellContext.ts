import { createContext, useContext } from 'react';

// Whether the page sits inside the signed-in app shell, beside its sidebar, rather than under
// the floating site header. Pages use it to drop the room they keep clear for that header.
export const InShellContext = createContext(false);

export function useInShell(): boolean {
  return useContext(InShellContext);
}

// Top padding for a page: room for the floating site header, or a short gap beside the sidebar.
export function usePageTop(): string {
  return useInShell() ? 'pt-8 sm:pt-10' : 'pt-32 sm:pt-36';
}

// The redesigned look of the shared building blocks (panels, tables, buttons, notices, fields).
// The whole app turns it on from the layout; the sidebar shell is a separate thing.
export const ModernLookContext = createContext(false);

export function useModernLook(): boolean {
  const modern = useContext(ModernLookContext);
  const inShell = useContext(InShellContext);
  return modern || inShell;
}
