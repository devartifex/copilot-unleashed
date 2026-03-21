import { access } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { execSync } from 'node:child_process';

/** Get workspace root via git, fallback to cwd — cached for process lifetime */
let cachedWorkspaceRoot: string | null = null;
function getWorkspaceRoot(): string {
  if (cachedWorkspaceRoot !== null) return cachedWorkspaceRoot;
  try {
    cachedWorkspaceRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
  } catch {
    cachedWorkspaceRoot = process.cwd();
  }
  return cachedWorkspaceRoot;
}

/** Regex to match @file mentions: @path/to/file.ext */
const FILE_MENTION_RE = /(?:^|\s)@((?:[^\s@]+\/)*[^\s@]+\.[a-zA-Z0-9]+)/g;

/** Parse @path/to/file tokens from message content. Returns resolved file attachments and cleaned prompt. */
export async function resolveFileMentions(
  content: string,
): Promise<{ prompt: string; fileAttachments: Array<{ type: 'file'; path: string; displayName: string }> }> {
  const workspaceRoot = getWorkspaceRoot();
  const mentions = [...content.matchAll(FILE_MENTION_RE)];
  const fileAttachments: Array<{ type: 'file'; path: string; displayName: string }> = [];
  const seen = new Set<string>();

  for (const match of mentions) {
    const relativePath = match[1];
    const absolutePath = resolve(workspaceRoot, relativePath);

    // Security: must be inside workspace
    if (!absolutePath.startsWith(workspaceRoot + '/')) continue;
    if (seen.has(absolutePath)) continue;

    try {
      await access(absolutePath);
    } catch {
      continue;
    }

    seen.add(absolutePath);
    fileAttachments.push({
      type: 'file',
      path: absolutePath,
      displayName: basename(relativePath),
    });
  }

  return { prompt: content, fileAttachments };
}
