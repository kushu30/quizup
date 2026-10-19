import { createServer } from 'node:http';
import { createApp } from './app.js';
import { supabaseAccessTokenVerifier } from './auth.js';
import { serverEnv } from './env.js';
import { ExamService } from './exam/examService.js';
import { createLlmProvider } from './llm/createProvider.js';
import { LiveEngine } from './live/engine.js';
import { SocketPublisher } from './live/socketPublisher.js';
import { SupabaseLiveRepository } from './live/supabaseRepository.js';
import { attachSocketServer } from './socket.js';

const publisher = new SocketPublisher();
const engine = new LiveEngine({ repository: new SupabaseLiveRepository(), publisher });

const exam = new ExamService({ engine, publisher });
engine.attachExam(exam);
const llmProvider = createLlmProvider(serverEnv);

const httpServer = createServer(
  createApp({ engine, exam, verifier: supabaseAccessTokenVerifier, llmProvider }),
);
const socketServer = attachSocketServer(httpServer, {
  engine,
  exam,
  publisher,
  verifier: supabaseAccessTokenVerifier,
});

async function start() {
  try {
    await engine.markAllStoredSessionsEnded();
  } catch (error) {
    console.error('Could not mark stale sessions as ended', error);
  }
  try {
    await engine.rehydrateExamSessions();
  } catch (error) {
    console.error('Could not restore open exam sessions', error);
  }
  exam.start();
  httpServer.listen(serverEnv.PORT, () => {
    console.log(`QuizUp server listening on port ${serverEnv.PORT}`);
    console.log(llmProvider ? `LLM provider: ${llmProvider.name}` : 'LLM provider: not configured');
  });
}

void start();

let shuttingDown = false;

function shutDownGracefully(signal: string) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log(`${signal} received, shutting down`);

  const forcedExitTimer = setTimeout(() => {
    console.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 10_000);
  forcedExitTimer.unref();

  engine.shutdown();
  void exam.stop();
  void socketServer.close(() => {
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutDownGracefully('SIGTERM'));
process.on('SIGINT', () => shutDownGracefully('SIGINT'));
