import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface InstructionFile {
  name: string;
  source: string;
  path: string;
  content: string;
  applyTo?: string;
}

export interface AgentFile {
  name: string;
  source: string;
  path: string;
  description?: string;
  tools?: string[];
}

export interface PromptFile {
  name: string;
  source: string;
  path: string;
  description: string;
  content: string;
}

export interface McpConfigEntry {
  name: string;
  source: string;
  type: string;
  url?: string;
  command?: string;
}

export interface DiscoveredCustomizations {
  instructions: InstructionFile[];
  agents: AgentFile[];
  prompts: PromptFile[];
  mcpServers: McpConfigEntry[];
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;

function parseFrontmatter(raw: string): Record<string, string> {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) return {};

  const result: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx < 1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key && value) result[key] = value;
  }
  return result;
}

function parseToolsList(raw: string): string[] | undefined {
  // Handle YAML list formats: [a, b, c] or bare comma-separated
  const stripped = raw.replace(/^\[|\]$/g, '').trim();
  if (!stripped) return undefined;
  return stripped.split(',').map((t) => t.trim()).filter(Boolean);
}

async function readFileSafe(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return null;
  }
}

async function readdirSafe(path: string): Promise<string[]> {
  try {
    return await readdir(path);
  } catch {
    return [];
  }
}

let cached: DiscoveredCustomizations | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 30_000;

/** Scan filesystem locations for Copilot customization files (instructions + agents + prompts). */
export async function scanCustomizations(
  copilotHome?: string,
  cwd?: string,
): Promise<DiscoveredCustomizations> {
  if (cached && Date.now() - cachedAt < CACHE_TTL_MS) return cached;

  const home = copilotHome ?? join(homedir(), '.copilot');
  const root = cwd ?? homedir();
  const instructions: InstructionFile[] = [];
  const agents: AgentFile[] = [];
  const prompts: PromptFile[] = [];

  // 1. User-level instructions: copilotHome/copilot-instructions.md
  const userInstructionsPath = join(home, 'copilot-instructions.md');
  const userContent = await readFileSafe(userInstructionsPath);
  if (userContent !== null) {
    const fm = parseFrontmatter(userContent);
    instructions.push({
      name: fm.description || 'User Instructions',
      source: 'user',
      path: userInstructionsPath,
      content: userContent,
      ...(fm.applyTo && { applyTo: fm.applyTo }),
    });
  }

  // 2. Repo-wide instructions: cwd/.github/copilot-instructions.md
  const repoInstructionsPath = join(root, '.github', 'copilot-instructions.md');
  const repoContent = await readFileSafe(repoInstructionsPath);
  if (repoContent !== null) {
    const fm = parseFrontmatter(repoContent);
    instructions.push({
      name: fm.description || 'Repository Instructions',
      source: 'repo',
      path: repoInstructionsPath,
      content: repoContent,
      ...(fm.applyTo && { applyTo: fm.applyTo }),
    });
  }

  // 3. Path-specific instructions: cwd/.github/instructions/*.instructions.md
  const instructionsDir = join(root, '.github', 'instructions');
  const instructionFiles = await readdirSafe(instructionsDir);
  for (const file of instructionFiles) {
    if (!file.endsWith('.instructions.md')) continue;
    const filePath = join(instructionsDir, file);
    const content = await readFileSafe(filePath);
    if (content === null) continue;

    const fm = parseFrontmatter(content);
    instructions.push({
      name: fm.description || file.replace('.instructions.md', ''),
      source: 'repo',
      path: filePath,
      content,
      ...(fm.applyTo && { applyTo: fm.applyTo }),
    });
  }

  // 4. Agent instruction files: AGENTS.md, CLAUDE.md, GEMINI.md
  const agentInstructionFiles = ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md'] as const;
  for (const fileName of agentInstructionFiles) {
    const filePath = join(root, fileName);
    const content = await readFileSafe(filePath);
    if (content === null) continue;

    instructions.push({
      name: fileName.replace('.md', ''),
      source: 'repo',
      path: filePath,
      content,
    });
  }

  // 5. Custom agents: cwd/.github/agents/*.agent.md
  const agentsDir = join(root, '.github', 'agents');
  const agentFiles = await readdirSafe(agentsDir);
  for (const file of agentFiles) {
    if (!file.endsWith('.agent.md')) continue;
    const filePath = join(agentsDir, file);
    const content = await readFileSafe(filePath);
    if (content === null) continue;

    const fm = parseFrontmatter(content);
    agents.push({
      name: fm.name || file.replace('.agent.md', ''),
      source: 'repo',
      path: filePath,
      ...(fm.description && { description: fm.description }),
      ...(fm.tools && { tools: parseToolsList(fm.tools) }),
    });
  }

  // 6. User-level agents: copilotHome/agents/*.agent.md
  const userAgentsDir = join(home, 'agents');
  const userAgentFiles = await readdirSafe(userAgentsDir);
  for (const file of userAgentFiles) {
    if (!file.endsWith('.agent.md')) continue;
    const filePath = join(userAgentsDir, file);
    const content = await readFileSafe(filePath);
    if (content === null) continue;

    const fm = parseFrontmatter(content);
    agents.push({
      name: fm.name || file.replace('.agent.md', ''),
      source: 'user',
      path: filePath,
      ...(fm.description && { description: fm.description }),
      ...(fm.tools && { tools: parseToolsList(fm.tools) }),
    });
  }

  // 7. Repo-level prompts: cwd/.github/prompts/*.prompt.md
  const repoPromptsDir = join(root, '.github', 'prompts');
  const repoPromptFiles = await readdirSafe(repoPromptsDir);
  for (const file of repoPromptFiles) {
    if (!file.endsWith('.prompt.md')) continue;
    const filePath = join(repoPromptsDir, file);
    const content = await readFileSafe(filePath);
    if (content === null) continue;

    const fm = parseFrontmatter(content);
    const title = file.replace('.prompt.md', '');
    prompts.push({
      name: title,
      source: 'repo',
      path: filePath,
      description: fm.description || title,
      content,
    });
  }

  // 8. User-level prompts: copilotHome/prompts/*.prompt.md
  const userPromptsDir = join(home, 'prompts');
  const userPromptFiles = await readdirSafe(userPromptsDir);
  for (const file of userPromptFiles) {
    if (!file.endsWith('.prompt.md')) continue;
    const filePath = join(userPromptsDir, file);
    const content = await readFileSafe(filePath);
    if (content === null) continue;

    const fm = parseFrontmatter(content);
    const title = file.replace('.prompt.md', '');
    prompts.push({
      name: title,
      source: 'user',
      path: filePath,
      description: fm.description || title,
      content,
    });
  }

  // 9. MCP servers from mcp-config.json (user-level and repo-level)
  const mcpServers: McpConfigEntry[] = [];
  for (const [dir, source] of [[home, 'user'], [join(root, '.github'), 'repo']] as const) {
    const mcpConfigPath = join(dir, 'mcp-config.json');
    const mcpRaw = await readFileSafe(mcpConfigPath);
    if (mcpRaw) {
      try {
        const parsed = JSON.parse(mcpRaw);
        const servers = parsed.mcpServers || parsed.servers || {};
        for (const [name, cfg] of Object.entries(servers)) {
          const c = cfg as Record<string, unknown>;
          const entry: McpConfigEntry = {
            name,
            source,
            type: (c.type as string) || (c.command ? 'stdio' : 'http'),
          };
          if (typeof c.url === 'string') entry.url = c.url;
          if (typeof c.command === 'string') entry.command = c.command;
          mcpServers.push(entry);
        }
      } catch { /* malformed JSON */ }
    }
  }

  cached = { instructions, agents, prompts, mcpServers };
  cachedAt = Date.now();
  console.log(`[scanner] Discovered ${instructions.length} instructions, ${agents.length} agents, ${prompts.length} prompts, ${mcpServers.length} mcp servers (home=${home}, root=${root})`);
  return cached;
}
