import { useMemo } from 'react';
import { encode } from 'uqr';

const QUIET_ZONE = 4;

interface JoinQrProps {
  url: string;
  className?: string;
}

export function JoinQr({ url, className = '' }: JoinQrProps) {
  const { size, cells } = useMemo(() => {
    const qr = encode(url, { ecc: 'M', border: 0 });
    const dark: [number, number][] = [];
    qr.data.forEach((row, y) =>
      row.forEach((on, x) => {
        if (on) {
          dark.push([x + QUIET_ZONE, y + QUIET_ZONE]);
        }
      }),
    );
    return { size: qr.size + QUIET_ZONE * 2, cells: dark };
  }, [url]);

  return (
    <svg
      role="img"
      aria-label={`QR code for ${url}`}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className={`block h-auto w-full ${className}`.trim()}
    >
      <rect width={size} height={size} fill="#ffffff" />
      {cells.map(([x, y]) => (
        <rect key={`${x},${y}`} data-dark="" x={x} y={y} width={1} height={1} fill="#1c2533" />
      ))}
    </svg>
  );
}
