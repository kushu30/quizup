import type { GroupSummary } from '@quizup/shared';
import { useEffect, useState } from 'react';
import { api, describeError } from '../lib/api';
import { Button, Notice, SelectField } from './ui';

interface SavedGroupPickerProps {
  busy: boolean;
  onAddGroup: (groupId: string) => void;
}

export function SavedGroupPicker({ busy, onAddGroup }: SavedGroupPickerProps) {
  const [groups, setGroups] = useState<GroupSummary[] | null>(null);
  const [selected, setSelected] = useState('');
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .listGroups()
      .then((loaded) => {
        if (!cancelled) {
          setGroups(loaded);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setFailure(describeError(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failure) {
    return <Notice tone="warning">Could not load your saved groups: {failure}</Notice>;
  }
  if (groups === null) {
    return null;
  }
  if (groups.length === 0) {
    return (
      <p className="text-sm text-muted">
        Teaching the same class again? Save it once under Students in the top menu, then add it here
        in one click.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-end gap-3">
      <SelectField
        label="Add a saved group"
        value={selected}
        onChange={(event) => setSelected(event.target.value)}
      >
        <option value="">Choose a group</option>
        {groups.map((group) => (
          <option key={group.id} value={group.id}>
            {`${group.name} (${group.memberCount})`}
          </option>
        ))}
      </SelectField>
      <Button
        variant="secondary"
        disabled={busy || selected === ''}
        onClick={() => onAddGroup(selected)}
      >
        Add group
      </Button>
    </div>
  );
}
