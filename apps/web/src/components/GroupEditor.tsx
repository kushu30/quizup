import { parseRosterText, type GroupDetail, type RosterStudentInput } from '@quizup/shared';
import { useState } from 'react';
import { api, describeError } from '../lib/api';
import { RosterAddStep } from './RosterAddStep';
import { Button, Notice, Panel, TableFrame, TextField } from './ui';

interface GroupEditorProps {
  /** The group being edited, or null to create one. */
  group: GroupDetail | null;
  onSaved: () => void;
  onCancel: () => void;
}

export function GroupEditor({ group, onSaved, onCancel }: GroupEditorProps) {
  const [name, setName] = useState(group?.name ?? '');
  const [students, setStudents] = useState<RosterStudentInput[]>(
    () =>
      group?.students.map((student) =>
        student.email
          ? { displayName: student.displayName, email: student.email }
          : { displayName: student.displayName },
      ) ?? [],
  );
  const [text, setText] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function handleAdd() {
    setNote(null);
    const parsed = parseRosterText(text);
    if (parsed.errors.length > 0) {
      setProblems(parsed.errors.map((error) => `Line ${error.line}: ${error.message}`));
      return;
    }
    setProblems([]);
    const known = new Set(students.map((student) => student.displayName.toLowerCase()));
    const fresh = parsed.students.filter(
      (student) => !known.has(student.displayName.toLowerCase()),
    );
    const skipped = parsed.students.length - fresh.length;
    setStudents((current) => [...current, ...fresh]);
    setText('');
    setNote(
      `Added ${fresh.length} ${fresh.length === 1 ? 'student' : 'students'}.` +
        (skipped > 0 ? ` ${skipped} already in the group.` : '') +
        ' Press Save group to keep the changes.',
    );
  }

  async function handleSave() {
    setProblems([]);
    setBusy(true);
    try {
      const input = { name, students };
      if (group) {
        await api.updateGroup(group.id, input);
      } else {
        await api.createGroup(input);
      }
      onSaved();
    } catch (error) {
      setProblems([describeError(error)]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title={group ? `Edit ${group.name}` : 'New group'}
      description="A group is a saved list of students. Adding it to a quiz copies its students into that session, so later edits here never change a session that already started."
    >
      <div className="space-y-6">
        <TextField
          label="Group name"
          value={name}
          maxLength={60}
          onChange={(event) => setName(event.target.value)}
        />
        {problems.length > 0 && (
          <Notice tone="danger">
            <ul className="list-disc pl-5">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </Notice>
        )}
        <section aria-label="Group students" className="space-y-3">
          <h3 className="text-lg font-semibold">Students ({students.length})</h3>
          {students.length === 0 ? (
            <p className="text-sm text-muted">No students yet. Add some below.</p>
          ) : (
            <TableFrame>
              <table aria-label="Students in this group" className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-rule text-muted">
                    <th scope="col" className="px-3 py-2 font-medium">
                      Student
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
                  {students.map((student) => (
                    <tr key={student.displayName.toLowerCase()}>
                      <th scope="row" className="px-3 py-2.5 font-medium">
                        {student.displayName}
                        {student.email && (
                          <span className="block text-xs font-normal text-muted">
                            {student.email}
                          </span>
                        )}
                      </th>
                      <td className="px-3 py-2.5 text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          aria-label={`Remove ${student.displayName}`}
                          onClick={() =>
                            setStudents((current) => current.filter((entry) => entry !== student))
                          }
                        >
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableFrame>
          )}
        </section>
        <section aria-label="Add students" className="space-y-3">
          <h3 className="text-lg font-semibold">Add students</h3>
          {note && <Notice tone="info">{note}</Notice>}
          <RosterAddStep text={text} onTextChange={setText} onAdd={handleAdd} busy={busy} />
        </section>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy || name.trim() === ''} onClick={() => void handleSave()}>
            Save group
          </Button>
          <Button variant="secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </Panel>
  );
}
