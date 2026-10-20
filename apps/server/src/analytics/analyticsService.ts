import {
  analyticsSnapshotSchema,
  buildParticipantsCsv,
  buildResponsesCsv,
  formatChosenOption,
  type AnalyticsSnapshot,
  type ExportResponseRow,
  type MeResponse,
} from '@quizup/shared';
import type { LiveEngine } from '../live/engine.js';
import type { SummaryRecord } from '../live/types.js';
import { rebuildAnalyticsSnapshot } from './rebuild.js';

export type AnalyticsAccess<Value> =
  { kind: 'ok'; value: Value } | { kind: 'not_found' } | { kind: 'forbidden' };

function mayRead(record: SummaryRecord, user: MeResponse): boolean {
  return record.hostId === user.id || user.role === 'admin';
}

export class AnalyticsService {
  private readonly engine: LiveEngine;
  private readonly now: () => number;

  constructor(engine: LiveEngine, now: () => number = Date.now) {
    this.engine = engine;
    this.now = now;
  }

  private async authorize(
    sessionId: string,
    user: MeResponse,
  ): Promise<AnalyticsAccess<SummaryRecord>> {
    const record = await this.engine.repository.findSummaryRecord(sessionId);
    if (!record) {
      return { kind: 'not_found' };
    }
    return mayRead(record, user) ? { kind: 'ok', value: record } : { kind: 'forbidden' };
  }

  async getSummary(
    sessionId: string,
    user: MeResponse,
  ): Promise<AnalyticsAccess<AnalyticsSnapshot>> {
    const access = await this.authorize(sessionId, user);
    if (access.kind !== 'ok') {
      return access;
    }

    return this.snapshotFor(sessionId, access.value);
  }

  /** The snapshot for a session the caller has already been cleared to read. */
  async snapshotFor(
    sessionId: string,
    record: SummaryRecord,
  ): Promise<AnalyticsAccess<AnalyticsSnapshot>> {
    const stored = analyticsSnapshotSchema.safeParse(record.storedSummary);
    if (stored.success) {
      return { kind: 'ok', value: stored.data };
    }

    const live = this.engine.getAnalyticsSnapshot(sessionId, true);
    if (live) {
      return { kind: 'ok', value: live };
    }

    const source = await this.engine.repository.loadSessionAnalyticsSource(sessionId);
    if (!source) {
      return { kind: 'not_found' };
    }
    const rebuilt = rebuildAnalyticsSnapshot(source, this.now());
    if (rebuilt.status === 'ended') {
      try {
        await this.engine.repository.saveSessionSummary(
          sessionId,
          rebuilt,
          new Date(this.now()).toISOString(),
        );
      } catch (error) {
        console.error('Saving the rebuilt summary failed', error);
      }
    }
    return { kind: 'ok', value: rebuilt };
  }

  async getParticipantsCsv(sessionId: string, user: MeResponse): Promise<AnalyticsAccess<string>> {
    const summary = await this.getSummary(sessionId, user);
    return summary.kind === 'ok'
      ? { kind: 'ok', value: buildParticipantsCsv(summary.value) }
      : summary;
  }

  async getResponsesCsv(sessionId: string, user: MeResponse): Promise<AnalyticsAccess<string>> {
    const access = await this.authorize(sessionId, user);
    if (access.kind !== 'ok') {
      return access;
    }
    const source = await this.engine.repository.loadSessionAnalyticsSource(sessionId);
    if (!source) {
      return { kind: 'not_found' };
    }

    const participantNameById = new Map(
      source.participants.map((participant) => [participant.id, participant.displayName]),
    );
    const questionById = new Map(source.questions.map((question) => [question.id, question]));

    const rows: ExportResponseRow[] = [];
    const ordered = [...source.responses].sort(
      (first, second) =>
        first.answeredAtMs - second.answeredAtMs ||
        first.participantId.localeCompare(second.participantId),
    );
    for (const response of ordered) {
      const question = questionById.get(response.questionId);
      if (!question) {
        continue;
      }
      rows.push({
        participantName: participantNameById.get(response.participantId) ?? '',
        questionStem: question.stem,
        topic: question.topic,
        labeledDifficulty: question.difficulty,
        chosenOption: formatChosenOption(question.options, response.chosenIndex),
        correct: response.correct,
        responseMs: response.responseMs,
        points: response.points,
        participantEloBefore: response.participantEloBefore,
        questionEloBefore: response.questionEloBefore,
      });
    }
    return { kind: 'ok', value: buildResponsesCsv(rows) };
  }
}
