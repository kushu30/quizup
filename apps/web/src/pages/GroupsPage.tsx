import type { GroupDetail, GroupSummary } from '@quizup/shared';
import { useCallback, useEffect, useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { GroupEditor } from '../components/GroupEditor';
import { Button, Notice, PageHeader, PageLoader, Panel } from '../components/ui';
import { api, describeError } from '../lib/api';

type Editing = { group: GroupDetail | null } | null;

export function GroupsPage() {
  const [groups, setGroups] = useState<GroupSummary[] | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [toDelete, setToDelete] = useState<GroupSummary | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setGroups(await api.listGroups());
    } catch (error) {
      setMessage(describeError(error));
      setGroups((current) => current ?? []);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleEdit(summary: GroupSummary) {
    setMessage(null);
    try {
      setEditing({ group: await api.getGroup(summary.id) });
    } catch (error) {
      setMessage(describeError(error));
    }
  }

  async function handleDelete() {
    if (!toDelete) {
      return;
    }
    setBusy(true);
    try {
      await api.deleteGroup(toDelete.id);
      setToDelete(null);
      await load();
    } catch (error) {
      setMessage(describeError(error));
      setToDelete(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Students"
        description="Save the classes you teach as groups, then add a whole group to an invited-only quiz in one click."
        back={{ to: '/host', label: 'Back to dashboard' }}
        actions={
          editing ? undefined : (
            <Button onClick={() => setEditing({ group: null })}>New group</Button>
          )
        }
      />
      <div className="space-y-6">
        {message && <Notice tone="danger">{message}</Notice>}
        {editing ? (
          <GroupEditor
            key={editing.group?.id ?? 'new'}
            group={editing.group}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              void load();
            }}
          />
        ) : groups === null ? (
          <PageLoader label="Loading your groups" />
        ) : (
          <Panel title="Your groups">
            {groups.length === 0 ? (
              <p className="text-muted">
                You have no groups yet. Create one to reuse a class list across quizzes.
              </p>
            ) : (
              <ul className="divide-y divide-rule">
                {groups.map((group) => (
                  <li
                    key={group.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div>
                      <p className="font-medium">{group.name}</p>
                      <p className="text-sm text-muted">
                        {group.memberCount} {group.memberCount === 1 ? 'student' : 'students'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        aria-label={`Edit ${group.name}`}
                        onClick={() => void handleEdit(group)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        aria-label={`Delete ${group.name}`}
                        onClick={() => setToDelete(group)}
                      >
                        Delete
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}
      </div>
      {toDelete && (
        <ConfirmDialog
          title={`Delete ${toDelete.name}?`}
          confirmLabel="Delete group"
          busy={busy}
          onConfirm={() => void handleDelete()}
          onCancel={() => setToDelete(null)}
        >
          The saved list is removed. Sessions that already used this group keep their students.
        </ConfirmDialog>
      )}
    </div>
  );
}
