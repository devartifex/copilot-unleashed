import { homedir } from 'node:os';
import { CopilotClient } from '@github/copilot-sdk';
import { config } from '../config.js';

export function createCopilotClient(githubToken: string, configDir?: string): CopilotClient {
  const clientEnv: Record<string, string | undefined> = { ...process.env, GH_TOKEN: githubToken };

  // When configDir is set, pass COPILOT_HOME to the CLI subprocess so it
  // reads and writes session state from the same directory as the CLI.
  if (configDir) {
    clientEnv.COPILOT_HOME = configDir;
  }

  return new CopilotClient({
    githubToken,
    env: clientEnv,
    cwd: config.copilotCwd || homedir(),
  });
}
