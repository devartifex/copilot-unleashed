/**
 * Dev-only debug logger — calls are no-ops in production.
 * Avoids noisy `[DEBUG …]` lines flooding container logs.
 *
 * Reads NODE_ENV directly (not via config) so that importing this module
 * during build-time analysis (SvelteKit's postbuild) doesn't trigger
 * config.ts's fail-fast on missing SESSION_SECRET.
 */
const isDev = process.env.NODE_ENV !== 'production';

export const debug: (...args: unknown[]) => void =
  isDev
    ? (...args: unknown[]) => console.log(...args)
    : () => {};
