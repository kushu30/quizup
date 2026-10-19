import { bktUpdate, DEFAULT_BKT_PARAMS, normalizeTopicKey } from './bkt.js';
import {
  INITIAL_PLAYER_RATING,
  clampRating,
  expectedScore,
  initialQuestionRating,
  updateRatings,
} from './elo.js';
import type { Difficulty } from './enums.js';
import { createSeededRandom, pickWeighted, type RandomSource } from './sampling.js';

export interface SimulatedQuestion {
  id: string;
  topic: string;
  difficulty: Difficulty;
  rating: number;
}

export interface SimulatedStudent {
  name: string;
  ability: number;
  seed: number;
}

export interface SimulationStep {
  round: number;
  questionId: string;
  topic: string;
  difficulty: Difficulty;
  questionRating: number;
  correct: boolean;
  ratingBefore: number;
  ratingAfter: number;
  mastery: number;
}

export interface SimulatedStudentResult {
  name: string;
  ability: number;
  steps: SimulationStep[];
  finalRating: number;
}

export interface SimulationOptions {
  students: SimulatedStudent[];
  rounds: number;
  durationMs?: number;
  questions?: SimulatedQuestion[];
}

const SIMULATION_TOPICS = ['algebra', 'geometry', 'statistics'];
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
const DEFAULT_SIMULATION_DURATION_MS = 20_000;

export function createSimulationQuestions(): SimulatedQuestion[] {
  const questions: SimulatedQuestion[] = [];
  for (const difficulty of DIFFICULTIES) {
    for (let index = 0; index < 10; index += 1) {
      questions.push({
        id: `${difficulty}-${index}`,
        topic: SIMULATION_TOPICS[index % SIMULATION_TOPICS.length] as string,
        difficulty,
        rating: initialQuestionRating(difficulty),
      });
    }
  }
  return questions;
}

interface StudentRuntime {
  config: SimulatedStudent;
  rating: number;
  served: Set<string>;
  mastery: Map<string, number>;
  steps: SimulationStep[];
  pickRandom: RandomSource;
  answerRandom: RandomSource;
}

export function runAdaptiveSimulation(options: SimulationOptions): SimulatedStudentResult[] {
  const durationMs = options.durationMs ?? DEFAULT_SIMULATION_DURATION_MS;
  const questions = (options.questions ?? createSimulationQuestions()).map((question) => ({
    ...question,
  }));

  const runtimes: StudentRuntime[] = options.students.map((config) => ({
    config,
    rating: INITIAL_PLAYER_RATING,
    served: new Set(),
    mastery: new Map(),
    steps: [],
    pickRandom: createSeededRandom(config.seed),
    answerRandom: createSeededRandom(config.seed + 7919),
  }));

  for (let round = 1; round <= options.rounds; round += 1) {
    const assignments = new Map<StudentRuntime, SimulatedQuestion>();
    for (const runtime of runtimes) {
      const candidates = questions.filter((question) => !runtime.served.has(question.id));
      const picked = pickWeighted(candidates, runtime.rating, runtime.pickRandom);
      if (picked) {
        runtime.served.add(picked.id);
        assignments.set(runtime, picked);
      }
    }

    const ratingSnapshot = new Map(questions.map((question) => [question.id, question.rating]));

    for (const runtime of runtimes) {
      const question = assignments.get(runtime);
      if (!question) {
        continue;
      }
      const snapshotRating = ratingSnapshot.get(question.id) ?? question.rating;
      const correct =
        runtime.answerRandom.next() < expectedScore(runtime.config.ability, snapshotRating);
      const responseMs = Math.round((0.1 + 0.8 * runtime.answerRandom.next()) * durationMs);

      const update = updateRatings({
        playerRating: runtime.rating,
        questionRating: snapshotRating,
        correct,
        responseMs,
        durationMs,
      });
      const topicKey = normalizeTopicKey(question.topic);
      const mastery = bktUpdate(runtime.mastery.get(topicKey) ?? DEFAULT_BKT_PARAMS.pInit, correct);
      runtime.mastery.set(topicKey, mastery);

      runtime.steps.push({
        round,
        questionId: question.id,
        topic: question.topic,
        difficulty: question.difficulty,
        questionRating: snapshotRating,
        correct,
        ratingBefore: runtime.rating,
        ratingAfter: update.playerRating,
        mastery,
      });
      question.rating = clampRating(question.rating + (update.questionRating - snapshotRating));
      runtime.rating = update.playerRating;
    }
  }

  return runtimes.map((runtime) => ({
    name: runtime.config.name,
    ability: runtime.config.ability,
    steps: runtime.steps,
    finalRating: runtime.rating,
  }));
}
