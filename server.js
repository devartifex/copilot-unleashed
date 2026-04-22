import { createServer } from 'http';
import session from 'express-session';
import FileStoreFactory from 'session-file-store';
import { setupWebSocket } from './dist/ws/handler.js';
import { registerSession, deleteSessionById } from './dist/session-store.js';
import { config } from './dist/config.js';

// Load .env file for local development (dotenv is a devDependency)
try { const { config: dotenvConfig } = await import('dotenv'); dotenvConfig(); } catch {};

const FileStore = FileStoreFactory(session);
const isDev = config.isDev;
const port = config.port;
// config.sessionSecret throws fail-fast if SESSION_SECRET is unset — no fallback
const sessionSecret = config.sessionSecret;
const tokenMaxAge = config.tokenMaxAge;

// Set ORIGIN for SvelteKit adapter-node CSRF check before importing handler.
// Without this, adapter-node defaults protocol to 'https', causing origin mismatch on plain HTTP.
if (!process.env.ORIGIN) {
  process.env.ORIGIN = config.baseUrl;
}
// Raise adapter-node body limit to match upload endpoint's 50MB cap (default is 512KB)
if (!process.env.BODY_SIZE_LIMIT) {
  process.env.BODY_SIZE_LIMIT = String(50 * 1024 * 1024);
}
const { handler } = await import('./build/handler.js');

const sessionStorePath = config.sessionStorePath;
const sessionMiddleware = session({
  store: new FileStore({ path: sessionStorePath, ttl: 86400, retries: 0, logFn: () => {} }),
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  proxy: !isDev,
  cookie: {
    httpOnly: true,
    secure: !isDev,
    sameSite: 'lax',
    maxAge: tokenMaxAge,
  },
});

// Auth-cookie restore is handled canonically in src/hooks.server.ts (sessionHandle).
// Keeping a single restore path avoids drift and duplicated logic.

const server = createServer((req, res) => {
  sessionMiddleware(req, res, () => {
    const sessionId = registerSession(req.session);
    req.headers['x-session-id'] = sessionId;

    const origEnd = res.end.bind(res);
    res.end = function (...args) {
      deleteSessionById(sessionId);
      return origEnd(...args);
    };

    const origSetHeader = res.setHeader.bind(res);
    res.setHeader = function (...args) {
      if (!res.headersSent) return origSetHeader(...args);
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[WARN] setHeader("${args[0]}") called after headers sent — ${req.method} ${req.url}`);
      }
      return res;
    };

    const origWriteHead = res.writeHead.bind(res);
    res.writeHead = function (...args) {
      if (!res.headersSent) return origWriteHead(...args);
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[WARN] writeHead(${args[0]}) called after headers sent — ${req.method} ${req.url}`);
      }
      return res;
    };

    handler(req, res);
  });
});

setupWebSocket(server, sessionMiddleware);

server.listen(port, () => {
  console.log('');
  console.log('  Copilot Unleashed');
  console.log('  ──────────────────');
  console.log(`  Mode:  ${isDev ? 'Development' : 'Production'}`);
  console.log(`  URL:   http://localhost:${port}`);
  console.log('');
});

function shutdown() {
  console.log('\nShutting down...');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
