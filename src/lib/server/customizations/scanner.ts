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

export interface DiscoveredCustomizations {
  instructions: InstructionFile[];
  agents: AgentFile[];
  prompts: PromptFile[];
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

/** Scan filesystem locations for Copilot customization files (instructions + agents). */
export async function scanCustomizations(
  copilotHome?: string,
  cwd?: string,
): Promise<DiscoveredCustomizations> {
  if (cached) return cached;

  const home = copilotHome ?? join(homedir(), '.copilot');
  const root = cwd ?? process.cwd();
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
    prompts.push({
      name: fm.description || file.replace('.prompt.md', ''),
      source: 'repo',
      path: filePath,
      description: fm.description || file.replace('.prompt.md', ''),
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
    prompts.push({
      name: fm.description || file.replace('.prompt.md', ''),
      source: 'user',
      path: filePath,
      description: fm.description || file.replace('.prompt.md', ''),
      content,
    });
  }

  cached = { instructions, agents, prompts };
  return cached;
}

/** Clear the cached customizations (for testing or hot-reload). */
export function clearCache(): void {
  cached = null;
}
