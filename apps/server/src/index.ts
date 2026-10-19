import { createServer } from 'node:http';
import { createApp } from './app.js';
import { supabaseAccessTokenVerifier } from './auth.js';
import { serverEnv } from './env.js';
import { LiveEngine } from './live/engine.js';
import { SocketPublisher } from './live/socketPublisher.js';
import { SupabaseLiveRepository } from './live/supabaseRepository.js';
import { attachSocketServer } from './socket.js';

const publisher = new SocketPublisher();
const engine = new LiveEngine({ repository: new SupabaseLiveRepository(), publisher });

const httpServer = createServer(createApp({ engine, verifier: supabaseAccessTokenVerifier }));
const socketServer = attachSocketServer(httpServer, {
  engine,
  publisher,
  verifier: supabaseAccessTokenVerifier,
});

async function start() {
  try {
    await engine.markAllStoredSessionsEnded();
  } catch (error) {
    console.error('Could not mark stale sessions as ended', error);
  }
  httpServer.listen(serverEnv.PORT, () => {
    console.log(`QuizUp server listening on port ${serverEnv.PORT}`);
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
  void socketServer.close(() => {
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutDownGracefully('SIGTERM'));
process.on('SIGINT', () => shutDownGracefully('SIGINT'));
