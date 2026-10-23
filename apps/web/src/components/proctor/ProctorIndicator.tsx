import type { DeviceState } from '../../lib/proctorMedia/mediaStreamStore';

interface ProctorIndicatorProps {
  /** Null when the host did not turn that device on. */
  camera: DeviceState | null;
  mic: DeviceState | null;
  flags: { count: number; limit: number | null } | null;
}

// The dark look of the ended session pill, so the exam header reads as one family.
const PILL =
  'inline-flex h-7 items-center gap-2 rounded-[0.6rem] bg-gradient-to-b from-[#2a2930] to-night px-2.5 text-xs font-medium whitespace-nowrap text-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_0_0_1px_rgba(0,0,0,0.6),0_1px_2px_rgba(17,16,20,0.2)]';

function DevicePill({ label, state }: { label: string; state: DeviceState }) {
  const on = state === 'ready';
  return (
    <span className={PILL}>
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-accent-400' : 'bg-amber-400'}`}
      />
      {on ? `${label} on` : `${label} unavailable`}
    </span>
  );
}

/** Keeps the student aware of what is being watched, and of their flag count when there is a limit. */
export function ProctorIndicator({ camera, mic, flags }: ProctorIndicatorProps) {
  if (camera === null && mic === null) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {camera !== null && <DevicePill label="Camera" state={camera} />}
      {mic !== null && <DevicePill label="Mic" state={mic} />}
      {flags !== null && flags.limit !== null && (
        <span className={PILL}>
          Flags {flags.count} of {flags.limit}
        </span>
      )}
    </div>
  );
}
