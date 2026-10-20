import { joinInfoSchema, type JoinInfo } from '@quizup/shared';
import { webEnv } from './env';

export async function fetchJoinInfo(joinCode: string): Promise<JoinInfo | null> {
  try {
    const response = await fetch(
      `${webEnv.VITE_SERVER_URL}/join-info/${encodeURIComponent(joinCode)}`,
    );
    if (!response.ok) {
      return null;
    }
    const parsed = joinInfoSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
