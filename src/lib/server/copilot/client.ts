import { homedir } from 'node:os';
import { CopilotClient } from '@github/copilot-sdk';

export function createCopilotClient(githubToken: string): CopilotClient {
  return new CopilotClient({
    githubToken,
    env: { ...process.env, GH_TOKEN: githubToken },
    // Use home directory as CWD so the CLI subprocess has write access
    // (in Docker, WORKDIR /app is root-owned but the process runs as node)
    cwd: homedir(),
  });
}
