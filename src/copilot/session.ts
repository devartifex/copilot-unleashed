import { CopilotClient } from '@github/copilot-sdk';
import type { PermissionRequest, PermissionRequestResult, PermissionHandler } from '@github/copilot-sdk';

// Only approve read-only requests; deny shell, write, and unknown custom tools.
const approveReadOnly: PermissionHandler = (request: PermissionRequest): PermissionRequestResult => {
  if (request.kind === 'read' || request.kind === 'url') {
    return { kind: 'approved' };
  }
  if (request.kind === 'mcp') {
    const tool = (typeof request.toolName === 'string' ? request.toolName : '').toLowerCase();
    const readOnlyPatterns = [
      'list', 'get', 'search', 'read', 'fetch', 'describe', 'show', 'count', 'find',
    ];
    if (readOnlyPatterns.some((p) => tool.includes(p))) {
      return { kind: 'approved' };
    }
  }
  return { kind: 'denied-by-rules' };
};

// Optional: if a GitHub MCP server package is installed locally, use it to give Copilot
// GitHub API tools (list repos, read files, create PRs, etc.).
// The official GitHub MCP server (https://github.com/github/github-mcp-server) is a Go
// binary and not yet available as an npm package. As a drop-in alternative you can install:
//   npm install @modelcontextprotocol/server-github
// Note: that package is deprecated — use it at your own risk until GitHub ships an npm release.
function resolveGitHubMcpServer(): { command: string; args: string[] } | null {
  try {
    const main = import.meta.resolve('@modelcontextprotocol/server-github');
    const resolved = main.startsWith('file://') ? new URL(main).pathname : main;
    return { command: 'node', args: [resolved] };
  } catch {
    return null; // Package not installed — Copilot runs without GitHub API tools
  }
}

export async function createCopilotSession(
  client: CopilotClient,
  githubToken?: string,
  model?: string
) {
  const mcpServer = githubToken ? resolveGitHubMcpServer() : null;

  const sessionConfig: Parameters<typeof client.createSession>[0] = {
    model: model || 'gpt-4.1',
    streaming: true,
    onPermissionRequest: approveReadOnly,
  };

  if (mcpServer && githubToken) {
    (sessionConfig as any).mcpServers = {
      github: {
        command: mcpServer.command,
        args: mcpServer.args,
        env: { GITHUB_PERSONAL_ACCESS_TOKEN: githubToken },
      },
    };
  }

  return client.createSession(sessionConfig);
}

export async function getAvailableModels(client: CopilotClient) {
  try {
    return await client.listModels();
  } catch {
    return [];
  }
}
