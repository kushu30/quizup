export function exitFullscreenIfActive(): void {
  if (document.fullscreenElement && typeof document.exitFullscreen === 'function') {
    void document.exitFullscreen().catch(() => undefined);
  }
}
