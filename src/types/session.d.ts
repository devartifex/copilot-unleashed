import 'express-session';

declare module 'express-session' {
  interface SessionData {
    githubToken?: string;
    githubUser?: { login: string; name: string };
    // Timestamp when the GitHub token was obtained — used for freshness checks
    githubAuthTime?: number;
    // Device flow — stored server-side, never sent to browser
    githubDeviceCode?: string;
    githubDeviceExpiry?: number;
  }
}
