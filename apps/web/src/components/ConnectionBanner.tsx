import { Notice } from './ui';

export function ConnectionBanner({ children }: { children?: string }) {
  return (
    <div role="status" aria-label="Reconnecting">
      <Notice tone="warning">
        {children ?? 'Connection lost. Reconnecting now. Your place is saved.'}
      </Notice>
    </div>
  );
}
