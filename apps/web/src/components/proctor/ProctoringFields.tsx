import { Switch } from '../DeliveryOptions';
import { ProctorOptions, type ProctorOptionsValue } from './ProctorOptions';

interface ProctoringFieldsProps {
  kind: 'live' | 'exam';
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  options: ProctorOptionsValue;
  onOptionsChange: (options: ProctorOptionsValue) => void;
}

/** Quiz editor section: proctor yes or no, and the further options once it is yes. */
export function ProctoringFields({
  kind,
  enabled,
  onEnabledChange,
  options,
  onOptionsChange,
}: ProctoringFieldsProps) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">Proctoring</legend>
      <Switch
        title="Proctor this assessment"
        checked={enabled}
        onChange={onEnabledChange}
        hint={
          enabled
            ? 'Yes: tab switches, copy and paste and similar signals are recorded for you. Students are told before they begin. You can change the choices below when you start the session.'
            : 'No: nothing about the students’ browsing is recorded.'
        }
      />
      {enabled && <ProctorOptions kind={kind} value={options} onChange={onOptionsChange} />}
    </fieldset>
  );
}
