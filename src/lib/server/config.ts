import { env } from '$env/dynamic/private';

function required(name: string): string {
  const val = env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

export const config = {
  port: parseInt(env.PORT || '3000'),
  baseUrl: env.BASE_URL || 'http://localhost:3000',
  sessionSecret: required('SESSION_SECRET'),
  sessionStorePath: env.SESSION_STORE_PATH || '.sessions',
  github: {
    clientId: required('GITHUB_CLIENT_ID'),
  },
  isDev: env.NODE_ENV !== 'production',
  allowedUsers: env.ALLOWED_GITHUB_USERS
    ? env.ALLOWED_GITHUB_USERS.split(',').map((u) => u.trim().toLowerCase())
    : [],
  tokenMaxAge: parseInt(env.TOKEN_MAX_AGE_MS || String(7 * 24 * 60 * 60 * 1000)),
  sessionPoolTtl: parseInt(env.SESSION_POOL_TTL_MS || String(5 * 60 * 1000)),
};
