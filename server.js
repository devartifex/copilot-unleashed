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
    const sessionId = registerSession(req.session);
    req.headers['x-session-id'] = sessionId;

    const origEnd = res.end.bind(res);
    res.end = function (...args) {
      deleteSessionById(sessionId);
      return origEnd(...args);
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
