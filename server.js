// server.js — Production entry point.
// Wraps SvelteKit's adapter-node handler with:
//   • express-session (cookie-based auth persistence)
//   • WebSocket server (real-time AI streaming)
//   • Auth cookie restore (survives container restarts)
import { createServer } from 'http';
import session from 'express-session';
import FileStoreFactory from 'session-file-store';
import { setupWebSocket } from './dist/ws/handler.js';
import { registerSession, deleteSessionById } from './dist/session-store.js';
import { unsealAuth, parseCookieValue, AUTH_COOKIE_NAME } from './dist/auth/auth-cookie.js';

const FileStore = FileStoreFactory(session);
const isDev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3000');
const sessionSecret = process.env.SESSION_SECRET || 'dev-secret-change-me';
const tokenMaxAge = parseInt(process.env.TOKEN_MAX_AGE_MS || String(7 * 24 * 60 * 60 * 1000));

// Set ORIGIN for SvelteKit adapter-node CSRF check before importing handler.
// Without this, adapter-node defaults protocol to 'https', causing origin mismatch on plain HTTP.
if (!process.env.ORIGIN) {
  process.env.ORIGIN = process.env.BASE_URL || `http://localhost:${port}`;
}
const { handler } = await import('./build/handler.js');

if (!isDev && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET environment variable is required in production');
}

// Session store: file-based, 24-hour TTL.
// rolling:true refreshes the cookie on every request to keep active users logged in.
const sessionStorePath = process.env.SESSION_STORE_PATH || (isDev ? '.sessions' : '/data/sessions');
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

/** Restore auth from encrypted cookie when session file is missing (e.g. after EmptyDir wipe). */
function restoreAuthFromCookie(req) {
  if (req.session && !req.session.githubToken) {
    const sealed = parseCookieValue(req.headers.cookie, AUTH_COOKIE_NAME);
    if (sealed) {
      const data = unsealAuth(sealed, sessionSecret, tokenMaxAge);
      if (data) {
        req.session.githubToken = data.githubToken;
        req.session.githubUser = data.githubUser;
        req.session.githubAuthTime = data.githubAuthTime;
        req.session.save(() => {});
        console.log(`[AUTH-COOKIE] Restored auth for user=${data.githubUser.login}`);
      }
    }
  }
}

const server = createServer((req, res) => {
  sessionMiddleware(req, res, () => {
    restoreAuthFromCookie(req);

    // Bridge: pass the Express session to SvelteKit via a request header.
    // SvelteKit's hooks.server.ts reads x-session-id to attach session data to locals.
    const sessionId = registerSession(req.session);
    req.headers['x-session-id'] = sessionId;

    // Clean up the session bridge entry when the response is sent
    const origEnd = res.end.bind(res);
    res.end = function (...args) {
      deleteSessionById(sessionId);
      return origEnd(...args);
    };

    handler(req, res);
  });
});

// Attach the WebSocket server to the same HTTP server (same port, path: /ws)
setupWebSocket(server, sessionMiddleware);

server.listen(port, () => {
  console.log('');
  console.log('  Copilot Unleashed');
  console.log('  ──────────────────');
  console.log(`  Mode:  ${isDev ? 'Development' : 'Production'}`);
  console.log(`  URL:   http://localhost:${port}`);
  console.log('');
});

// Graceful shutdown: allow in-flight requests to finish (5 s hard limit)
function shutdown() {
  console.log('\nShutting down...');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
