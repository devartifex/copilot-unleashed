import { createServer } from 'http';
import { handler } from './build/handler.js';
import { WebSocketServer } from 'ws';
import { parse } from 'cookie';
import session from 'express-session';
import FileStoreFactory from 'session-file-store';

const FileStore = FileStoreFactory(session);
const isDev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3000');

// Session middleware — shared between HTTP and WebSocket
const sessionMiddleware = session({
  store: isDev
    ? new FileStore({ path: process.env.SESSION_STORE_PATH || '.sessions', ttl: 86400, retries: 0, logFn: () => {} })
    : undefined,
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: !isDev,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  },
});

const server = createServer((req, res) => {
  // Apply session middleware then delegate to SvelteKit handler
  sessionMiddleware(req, res, () => {
    handler(req, res);
  });
});

// WebSocket server on same HTTP server
const wss = new WebSocketServer({ server, path: '/ws' });

// Import WS handler dynamically (will be set up in Phase 3)
// For now, just accept connections and log
wss.on('connection', (ws, req) => {
  // Session will be parsed from cookies in the WS handler
  sessionMiddleware(req, {}, () => {
    ws.send(JSON.stringify({ type: 'connected', message: 'SvelteKit WebSocket server' }));
  });

  ws.on('message', (data) => {
    // Placeholder — full handler imported in Phase 3/backend migration
    console.log('WS message received:', data.toString().slice(0, 100));
  });

  ws.on('close', () => {
    console.log('WS client disconnected');
  });
});

server.listen(port, () => {
  console.log('');
  console.log('  Copilot CLI Mobile (SvelteKit)');
  console.log('  ──────────────────────────────');
  console.log(`  Mode:  ${isDev ? 'Development' : 'Production'}`);
  console.log(`  URL:   http://localhost:${port}`);
  console.log(`  Port:  ${port}`);
  console.log('');
});

// Graceful shutdown
function shutdown() {
  console.log('\nShutting down...');
  wss.clients.forEach((ws) => ws.close());
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
