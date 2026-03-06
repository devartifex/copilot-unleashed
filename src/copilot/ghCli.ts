import { spawn } from 'node:child_process';

const GH_COPILOT_TIMEOUT_MS = 120_000;

let ghCopilotAvailable: boolean | null = null;

type CommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};

function runCommand(command: string, args: string[], timeoutMs = GH_COPILOT_TIMEOUT_MS, extraEnv?: Record<string, string>): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        resolve({ code: 124, stdout, stderr: `${stderr}\nCommand timed out` });
        return;
      }
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

export async function ensureGhCopilotAvailable(githubToken?: string): Promise<void> {
  if (ghCopilotAvailable) return;

  const env = githubToken ? { GH_TOKEN: githubToken } : undefined;
  try {
    const probe = await runCommand('gh', ['copilot', '--help'], 15_000, env);
    if (probe.code === 0) {
      ghCopilotAvailable = true;
      return;
    }
  } catch {
    // Fall through to user-friendly error.
  }

  throw new Error(
    'gh copilot is not available. Install/enable it and authenticate: gh extension install github/gh-copilot && gh copilot auth'
  );
}

export async function runGhCopilotSuggest(prompt: string, githubToken?: string): Promise<string> {
  await ensureGhCopilotAvailable(githubToken);

  const env = githubToken ? { GH_TOKEN: githubToken } : undefined;
  const result = await runCommand('gh', ['copilot', 'suggest', '-t', 'shell', prompt], GH_COPILOT_TIMEOUT_MS, env);
  if (result.code !== 0) {
    const details = (result.stderr || result.stdout || 'unknown error').trim();
    throw new Error(`gh copilot suggest failed: ${details}`);
  }

  const output = result.stdout.trim();
  if (!output) {
    return 'No output returned by gh copilot.';
  }
  return output;
}

export async function runGhCopilotExplain(prompt: string, githubToken?: string): Promise<string> {
  await ensureGhCopilotAvailable(githubToken);

  const env = githubToken ? { GH_TOKEN: githubToken } : undefined;
  const result = await runCommand('gh', ['copilot', 'explain', prompt], GH_COPILOT_TIMEOUT_MS, env);
  if (result.code !== 0) {
    const details = (result.stderr || result.stdout || 'unknown error').trim();
    throw new Error(`gh copilot explain failed: ${details}`);
  }

  const output = result.stdout.trim();
  if (!output) {
    return 'No output returned by gh copilot.';
  }
  return output;
}
