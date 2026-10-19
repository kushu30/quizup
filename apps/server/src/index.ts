import { createServer } from 'node:http';
import { createApp } from './app.js';
import { serverEnv } from './env.js';
import { attachSocketServer } from './socket.js';

const httpServer = createServer(createApp());
const socketServer = attachSocketServer(httpServer);

httpServer.listen(serverEnv.PORT, () => {
  console.log(`QuizUp server listening on port ${serverEnv.PORT}`);
});

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

  void socketServer.close(() => {
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutDownGracefully('SIGTERM'));
process.on('SIGINT', () => shutDownGracefully('SIGINT'));
