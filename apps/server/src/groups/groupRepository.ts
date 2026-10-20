import type { GroupDetail, GroupSaveInput, GroupSummary } from '@quizup/shared';
import { throwIfSupabaseError } from '../http.js';
import { supabaseAdmin } from '../supabaseAdmin.js';

export interface GroupRepository {
  list: (hostId: string) => Promise<GroupSummary[]>;
  get: (hostId: string, groupId: string) => Promise<GroupDetail | null>;
  /** Creates a group when `groupId` is null, otherwise replaces it. */
  save: (
    hostId: string,
    groupId: string | null,
    input: GroupSaveInput,
  ) => Promise<string | 'not_found' | 'name_taken'>;
  remove: (hostId: string, groupId: string) => Promise<boolean>;
}

const UNIQUE_VIOLATION = '23505';

interface GroupRow {
  id: string;
  name: string;
  student_group_members: { count: number }[];
}

interface MemberRow {
  display_name: string;
  email: string | null;
  position: number;
}

export const supabaseGroupRepository: GroupRepository = {
  async list(hostId) {
    const { data, error } = await supabaseAdmin
      .from('student_groups')
      .select('id, name, student_group_members(count)')
      .eq('host_id', hostId)
      .order('name', { ascending: true });
    throwIfSupabaseError(error);
    return ((data ?? []) as GroupRow[]).map((row) => ({
      id: row.id,
      name: row.name,
      memberCount: row.student_group_members[0]?.count ?? 0,
    }));
  },

  async get(hostId, groupId) {
    const { data, error } = await supabaseAdmin
      .from('student_groups')
      .select('id, name')
      .eq('id', groupId)
      .eq('host_id', hostId)
      .maybeSingle();
    throwIfSupabaseError(error);
    if (!data) {
      return null;
    }
    const members = await supabaseAdmin
      .from('student_group_members')
      .select('display_name, email, position')
      .eq('group_id', groupId)
      .order('position', { ascending: true });
    throwIfSupabaseError(members.error);
    return {
      id: data.id,
      name: data.name,
      students: ((members.data ?? []) as MemberRow[]).map((row) => ({
        displayName: row.display_name,
        email: row.email,
      })),
    };
  },

  async save(hostId, groupId, input) {
    const { data, error } = await supabaseAdmin.rpc('save_student_group', {
      p_group_id: groupId,
      p_host_id: hostId,
      p_name: input.name,
      p_members: input.students,
    });
    if (error?.code === UNIQUE_VIOLATION) {
      return 'name_taken';
    }
    throwIfSupabaseError(error);
    return typeof data === 'string' ? data : 'not_found';
  },

  async remove(hostId, groupId) {
    const { data, error } = await supabaseAdmin
      .from('student_groups')
      .delete()
      .eq('id', groupId)
      .eq('host_id', hostId)
      .select('id');
    throwIfSupabaseError(error);
    return (data ?? []).length > 0;
  },
};

export function createInMemoryGroupRepository(): GroupRepository {
  const groups = new Map<string, { hostId: string; detail: GroupDetail }>();
  let nextId = 1;
  const idFor = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const nameTaken = (hostId: string, name: string, exceptId: string | null) =>
    [...groups.values()].some(
      (entry) =>
        entry.hostId === hostId &&
        entry.detail.id !== exceptId &&
        entry.detail.name.toLowerCase() === name.toLowerCase(),
    );

  return {
    async list(hostId) {
      return [...groups.values()]
        .filter((entry) => entry.hostId === hostId)
        .map(({ detail }) => ({
          id: detail.id,
          name: detail.name,
          memberCount: detail.students.length,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    async get(hostId, groupId) {
      const entry = groups.get(groupId);
      return entry && entry.hostId === hostId ? entry.detail : null;
    },
    async save(hostId, groupId, input) {
      if (groupId !== null && groups.get(groupId)?.hostId !== hostId) {
        return 'not_found';
      }
      if (nameTaken(hostId, input.name, groupId)) {
        return 'name_taken';
      }
      const id = groupId ?? idFor(nextId++);
      groups.set(id, {
        hostId,
        detail: {
          id,
          name: input.name,
          students: input.students.map((student) => ({
            displayName: student.displayName,
            email: student.email ?? null,
          })),
        },
      });
      return id;
    },
    async remove(hostId, groupId) {
      if (groups.get(groupId)?.hostId !== hostId) {
        return false;
      }
      return groups.delete(groupId);
    },
  };
}
