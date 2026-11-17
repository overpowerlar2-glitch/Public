// Single-process entry point: Next.js (pages + REST API) and Socket.IO (real-time games) on one HTTP server.
try { process.loadEnvFile(); } catch { /* no .env file: rely on real environment variables */ }
import { createServer } from 'node:http';
import next from 'next';
import { Server } from 'socket.io';
import { createHub } from './server/hub';

const dev = process.env.NODE_ENV !== 'production';
const port = Number(process.env.PORT || 3000);
const hostname = process.env.HOST || '0.0.0.0';

async function main() {
  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();
  await app.prepare();
  const httpServer = createServer((req, res) => handle(req, res));
  const io = new Server(httpServer, { path: '/ws', serveClient: false, pingInterval: 10_000, pingTimeout: 8_000 });
  // The hub is exposed on globalThis so REST handlers (same process) can read live presence.
  const hub = createHub(io);
  (globalThis as unknown as { __tabiyaHub: unknown }).__tabiyaHub = hub;
  httpServer.listen(port, hostname, () => console.log(`▸ Tabiya ready on http://localhost:${port} (${dev ? 'development' : 'production'})`));
  const stop = () => { hub.stop(); io.close(); httpServer.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
main().catch((e) => { console.error(e); process.exit(1); });
