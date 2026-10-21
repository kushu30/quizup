import { useEffect, useRef } from 'react';

// Decorative ordered-dither texture for the landing page, drawn once onto a canvas (and again
// on resize). It can fill its box with a field, or only the shape of a line of text.
// Purely visual and hidden from assistive tech.

// glow: an oval bright spot in the middle. rise: brighter toward the bottom edge.
// fall: brighter toward the top edge. text: the letters of `text`, denser toward the bottom.
type TextureField = 'glow' | 'rise' | 'fall' | 'text';

interface TextureProps {
  field: TextureField;
  color: string;
  opacity?: number;
  cell?: number;
  text?: string;
  // Lights the dots around the pointer when it moves over the parent element.
  interactive?: boolean;
  highlight?: string;
  className?: string;
}

// 8x8 Bayer matrix, normalised to 0..1 thresholds.
const BAYER = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
].map((row) => row.map((value) => (value + 0.5) / 64));

const TEXT_FONT = '600 {size}px "Geist Variable", ui-sans-serif, system-ui, sans-serif';

function hash(x: number, y: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

// Smooth value noise, so the dither drifts in soft patches rather than even bands.
function noise(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const sx = (x - x0) ** 2 * (3 - 2 * (x - x0));
  const sy = (y - y0) ** 2 * (3 - 2 * (y - y0));
  const top = hash(x0, y0) + (hash(x0 + 1, y0) - hash(x0, y0)) * sx;
  const bottom = hash(x0, y0 + 1) + (hash(x0 + 1, y0 + 1) - hash(x0, y0 + 1)) * sx;
  return top + (bottom - top) * sy;
}

function fieldValue(field: Exclude<TextureField, 'text'>, u: number, v: number): number {
  if (field === 'glow') {
    const dx = (u - 0.5) / 0.6;
    const dy = (v - 0.55) / 0.6;
    return Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy)) ** 0.9;
  }
  const t = field === 'rise' ? v : 1 - v;
  return t ** 1.8 * (0.8 + 0.2 * Math.sin(u * 9 + v * 3));
}

// Draws the text once, offscreen, and returns a coverage lookup (0..1) in CSS pixels.
function textCoverage(text: string, width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width);
  canvas.height = Math.ceil(height);
  const context = canvas.getContext('2d');
  if (!context) {
    return () => 0;
  }
  let size = height * 1.25;
  context.font = TEXT_FONT.replace('{size}', String(size));
  const measured = context.measureText(text).width;
  if (measured > width) {
    size *= width / measured;
    context.font = TEXT_FONT.replace('{size}', String(size));
  }
  context.textBaseline = 'alphabetic';
  context.textAlign = 'center';
  context.fillStyle = '#000';
  context.fillText(text, width / 2, height * 0.98);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  return (x: number, y: number) => {
    const index = (Math.floor(y) * canvas.width + Math.floor(x)) * 4 + 3;
    return (data[index] ?? 0) / 255;
  };
}

const SPOTLIGHT_RADIUS = 150;

// Canvas cannot read CSS variables, so `var(--name)` colours are looked up on the element.
function resolveColor(color: string, element: Element): string {
  const name = color.match(/^var\((--[\w-]+)\)$/)?.[1];
  if (!name) {
    return color;
  }
  return getComputedStyle(element).getPropertyValue(name).trim() || '#888888';
}

export function Texture({
  field,
  color,
  opacity = 1,
  cell = 4,
  text = '',
  interactive = false,
  highlight = '#ffffff',
  className = '',
}: TextureProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || typeof ResizeObserver === 'undefined') {
      return;
    }
    const live = interactive && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let width = 0;
    let height = 0;
    let coverage: ((x: number, y: number) => number) | null = null;
    // The spotlight follows the pointer with a little lag and fades in and out.
    const spot = { x: 0, y: 0, targetX: 0, targetY: 0, strength: 0, target: 0 };
    let frame = 0;
    let base = color;
    let bright = highlight;

    const render = () => {
      const context = canvas.getContext('2d');
      if (!context || width === 0 || height === 0) {
        return;
      }
      context.clearRect(0, 0, width, height);
      const dot = Math.max(1, Math.round(cell * 0.5));
      const cols = Math.ceil(width / cell);
      const rows = Math.ceil(height / cell);
      const lit: number[] = [];
      context.fillStyle = base;
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const x = col * cell + cell / 2;
          const y = row * cell + cell / 2;
          const v = row / rows;
          const inside = coverage ? coverage(x, y) : 1;
          let value = coverage
            ? inside * (0.3 + 0.75 * v)
            : Math.min(
                1,
                fieldValue(field as Exclude<TextureField, 'text'>, col / cols, v) *
                  (0.45 + 1.1 * noise(col * 0.05, row * 0.07)) *
                  1.3,
              );
          let boost = 0;
          if (spot.strength > 0.001) {
            const distance = Math.hypot(x - spot.x, y - spot.y);
            boost = spot.strength * Math.max(0, 1 - distance / SPOTLIGHT_RADIUS) ** 2;
            value += inside > 0.5 ? boost : boost * 0.3;
          }
          if (value > (BAYER[row % 8]?.[col % 8] ?? 1)) {
            if (inside > 0.5 && boost > 0.2) {
              lit.push(col * cell, row * cell);
            } else {
              context.fillRect(col * cell, row * cell, dot, dot);
            }
          }
        }
      }
      context.fillStyle = bright;
      for (let index = 0; index < lit.length; index += 2) {
        context.fillRect(lit[index] ?? 0, lit[index + 1] ?? 0, dot, dot);
      }
    };

    const layout = () => {
      const box = canvas.getBoundingClientRect();
      width = box.width;
      height = box.height;
      const context = canvas.getContext('2d');
      if (!context || width === 0 || height === 0) {
        return;
      }
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      coverage = field === 'text' ? textCoverage(text, width, height) : null;
      base = resolveColor(color, canvas);
      bright = resolveColor(highlight, canvas);
      render();
    };

    const tick = () => {
      spot.x += (spot.targetX - spot.x) * 0.18;
      spot.y += (spot.targetY - spot.y) * 0.18;
      spot.strength += (spot.target - spot.strength) * 0.12;
      render();
      const settled =
        Math.abs(spot.target - spot.strength) < 0.005 &&
        Math.hypot(spot.targetX - spot.x, spot.targetY - spot.y) < 0.5;
      frame = settled ? 0 : requestAnimationFrame(tick);
    };
    const wake = () => {
      if (!frame) {
        frame = requestAnimationFrame(tick);
      }
    };

    const host = canvas.parentElement;
    const onMove = (event: PointerEvent) => {
      const box = canvas.getBoundingClientRect();
      spot.targetX = event.clientX - box.left;
      spot.targetY = event.clientY - box.top;
      if (spot.strength < 0.01) {
        spot.x = spot.targetX;
        spot.y = spot.targetY;
      }
      spot.target = 1;
      wake();
    };
    const onLeave = () => {
      spot.target = 0;
      wake();
    };
    if (live && host) {
      host.addEventListener('pointermove', onMove);
      host.addEventListener('pointerleave', onLeave);
    }

    layout();
    const observer = new ResizeObserver(layout);
    observer.observe(canvas);
    if (field === 'text') {
      void document.fonts?.ready.then(layout);
    }
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      if (live && host) {
        host.removeEventListener('pointermove', onMove);
        host.removeEventListener('pointerleave', onLeave);
      }
    };
  }, [field, color, cell, text, interactive, highlight]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
      style={{ opacity }}
    />
  );
}
