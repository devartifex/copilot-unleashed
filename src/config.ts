import dotenv from 'dotenv';
dotenv.config();

function required(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

export const config = {
  port: parseInt(process.env.PORT || '3000'),
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  sessionSecret: required('SESSION_SECRET'),
  sessionStorePath: process.env.SESSION_STORE_PATH || '.sessions',
  github: {
    clientId: required('GITHUB_CLIENT_ID'),
  },
  isDev: process.env.NODE_ENV !== 'production',
  // Optional: comma-separated list of GitHub usernames allowed to use the app
  allowedUsers: process.env.ALLOWED_GITHUB_USERS
    ? process.env.ALLOWED_GITHUB_USERS.split(',').map((u) => u.trim().toLowerCase())
    : [],
  // Token freshness: force re-auth after this many ms (default: 7 days)
  // 7 days balances UX (fewer re-auths) with security (token rotation)
  tokenMaxAge: parseInt(process.env.TOKEN_MAX_AGE_MS || String(7 * 24 * 60 * 60 * 1000)),
  // How long to keep CopilotClient alive after WebSocket disconnect (default: 5 min)
  sessionPoolTtl: parseInt(process.env.SESSION_POOL_TTL_MS || String(5 * 60 * 1000)),
};
