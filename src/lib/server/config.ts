import { homedir } from 'node:os';

function required(name: string): string {
  const val = process.env[name]?.trim();
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

function env(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function getConfig() {
  return {
    port: parseInt(env('PORT', '3000')),
    baseUrl: env('BASE_URL', 'http://localhost:3000'),
    sessionSecret: required('SESSION_SECRET'),
    sessionStorePath: env('SESSION_STORE_PATH', env('NODE_ENV', 'development') !== 'production' ? '.sessions' : '/data/sessions'),
    settingsStorePath: env('SETTINGS_STORE_PATH', env('NODE_ENV', 'development') !== 'production' ? '.settings' : '/data/settings'),
    github: {
      clientId: required('GITHUB_CLIENT_ID'),
    },
    isDev: env('NODE_ENV', 'development') !== 'production',
    allowedUsers: process.env.ALLOWED_GITHUB_USERS
      ? process.env.ALLOWED_GITHUB_USERS.split(',').map((u: string) => u.trim().toLowerCase())
      : [],
    tokenMaxAge: parseInt(env('TOKEN_MAX_AGE_MS', String(7 * 24 * 60 * 60 * 1000))),
    sessionPoolTtl: parseInt(env('SESSION_POOL_TTL_MS', String(5 * 60 * 1000))),
    maxSessionsPerUser: parseInt(env('MAX_SESSIONS_PER_USER', '5')),
    copilotConfigDir: process.env.COPILOT_CONFIG_DIR?.trim().replace(/^~/, homedir()) || undefined,
    copilotCwd: process.env.COPILOT_CWD?.trim().replace(/^~/, homedir()) || undefined,
    chatStatePath: env('CHAT_STATE_PATH', env('NODE_ENV', 'development') !== 'production' ? '.chat-state' : '/data/chat-state'),
    pushStorePath: env('PUSH_STORE_PATH', env('NODE_ENV', 'development') !== 'production' ? '.push-subscriptions' : '/data/push-subscriptions'),
    vapid: {
      publicKey: process.env.VAPID_PUBLIC_KEY?.trim() || '',
      privateKey: process.env.VAPID_PRIVATE_KEY?.trim() || '',
      subject: env('VAPID_SUBJECT', 'mailto:admin@example.com'),
    },
  };
}

let _config: ReturnType<typeof getConfig> | null = null;

export const config = new Proxy({} as ReturnType<typeof getConfig>, {
  get(_target, prop) {
    if (!_config) _config = getConfig();
    return (_config as Record<string | symbol, unknown>)[prop];
  },
});
