import { describe, expect, it } from 'vitest';
import { groupSaveSchema, groupStudentsToRosterInput } from './groups.js';

describe('groupSaveSchema', () => {
  it('trims the name and accepts students with or without email', () => {
    const parsed = groupSaveSchema.parse({
      name: '  Year 9A ',
      students: [{ displayName: 'Asha Rao', email: 'asha@example.com' }, { displayName: 'Ben' }],
    });
    expect(parsed.name).toBe('Year 9A');
    expect(parsed.students).toHaveLength(2);
  });

  it('allows an empty group so a host can create it and fill it later', () => {
    expect(groupSaveSchema.safeParse({ name: 'New', students: [] }).success).toBe(true);
  });

  it('rejects an empty name, a long name and unknown fields', () => {
    expect(groupSaveSchema.safeParse({ name: '  ', students: [] }).success).toBe(false);
    expect(groupSaveSchema.safeParse({ name: 'x'.repeat(61), students: [] }).success).toBe(false);
    expect(groupSaveSchema.safeParse({ name: 'A', students: [], extra: 1 }).success).toBe(false);
  });

  it('rejects the same name twice, ignoring case', () => {
    const result = groupSaveSchema.safeParse({
      name: 'A',
      students: [{ displayName: 'Asha' }, { displayName: 'ASHA' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects more than 500 students', () => {
    const students = Array.from({ length: 501 }, (_, index) => ({ displayName: `S${index}` }));
    expect(groupSaveSchema.safeParse({ name: 'Big', students }).success).toBe(false);
  });
});

describe('groupStudentsToRosterInput', () => {
  it('drops a missing email instead of sending null', () => {
    expect(
      groupStudentsToRosterInput({
        id: '11111111-1111-4111-8111-111111111111',
        name: 'A',
        students: [
          { displayName: 'Asha', email: 'a@example.com' },
          { displayName: 'Ben', email: null },
        ],
      }),
    ).toEqual([{ displayName: 'Asha', email: 'a@example.com' }, { displayName: 'Ben' }]);
  });
});
