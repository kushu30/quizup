import { describeDevice, type DeviceInfo, type DeviceKind } from '@quizup/shared';

const KIND_LABELS: Record<DeviceKind, string> = {
  phone: 'Phone',
  tablet: 'Tablet',
  computer: 'Computer',
  unknown: 'Unknown',
};

export function StudentDevice({ devices }: { devices: DeviceInfo[] }) {
  const latest = devices.at(-1);
  return (
    <details className="group text-sm">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-sm text-muted hover:text-ink">
        {latest ? KIND_LABELS[latest.kind] : 'Unknown'}
        <svg
          aria-hidden="true"
          viewBox="0 0 12 12"
          className="h-3 w-3 transition-transform group-open:rotate-180"
        >
          <path
            d="M2.5 4.5 6 8l3.5-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </summary>
      <div className="mt-2 space-y-1 rounded-md bg-paper p-2 text-xs text-ink">
        {devices.length === 0 ? (
          <p>No device recorded</p>
        ) : (
          <ul className="space-y-1">
            {devices.map((device, index) => (
              <li key={index}>{describeDevice(device)}</li>
            ))}
          </ul>
        )}
        {devices.length > 1 && <p className="text-muted">Used {devices.length} devices</p>}
      </div>
    </details>
  );
}
