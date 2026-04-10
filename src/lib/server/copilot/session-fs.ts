import { readFile, writeFile, appendFile, stat, mkdir, readdir, rm, rename, access } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
import type { SessionFsHandler } from '@github/copilot-sdk';
import type { CopilotSession } from '@github/copilot-sdk';

/**
 * Creates a SessionFsHandler scoped to the session workspace directory.
 * All path operations are sandboxed — attempts to escape the workspace are rejected.
 */
export function createSessionFsHandlerFactory(workspaceRoot: string) {
  return (_session: CopilotSession): SessionFsHandler => {
    function safePath(requestedPath: string): string {
      const resolved = resolve(workspaceRoot, requestedPath);
      const rel = relative(workspaceRoot, resolved);
      if (rel.startsWith('..') || resolve(resolved) !== resolved.replace(/\/$/, '')) {
        throw new Error(`Path traversal blocked: ${requestedPath}`);
      }
      return resolved;
    }

    return {
      async readFile(params) {
        const filePath = safePath(params.path);
        const content = await readFile(filePath, 'utf8');
        return { content };
      },

      async writeFile(params) {
        const filePath = safePath(params.path);
        const dir = join(filePath, '..');
        await mkdir(dir, { recursive: true });
        await writeFile(filePath, params.content, {
          encoding: 'utf8',
          ...(params.mode != null ? { mode: params.mode } : {}),
        });
      },

      async appendFile(params) {
        const filePath = safePath(params.path);
        await appendFile(filePath, params.content, 'utf8');
      },

      async exists(params) {
        const filePath = safePath(params.path);
        try {
          await access(filePath);
          return { exists: true };
        } catch {
          return { exists: false };
        }
      },

      async stat(params) {
        const filePath = safePath(params.path);
        const s = await stat(filePath);
        return {
          size: s.size,
          isFile: s.isFile(),
          isDirectory: s.isDirectory(),
          mtime: s.mtime.toISOString(),
          birthtime: s.birthtime.toISOString(),
        };
      },

      async mkdir(params) {
        const dirPath = safePath(params.path);
        await mkdir(dirPath, { recursive: params.recursive ?? true });
      },

      async readdir(params) {
        const dirPath = safePath(params.path);
        const entries = await readdir(dirPath);
        return { entries };
      },

      async readdirWithTypes(params) {
        const dirPath = safePath(params.path);
        const dirents = await readdir(dirPath, { withFileTypes: true });
        return {
          entries: dirents.map(d => ({
            name: d.name,
            type: d.isDirectory() ? 'directory' as const : 'file' as const,
          })),
        };
      },

      async rm(params) {
        const filePath = safePath(params.path);
        await rm(filePath, {
          recursive: params.recursive ?? false,
          force: params.force ?? false,
        });
      },

      async rename(params) {
        const oldPath = safePath(params.src);
        const newPath = safePath(params.dest);
        await rename(oldPath, newPath);
      },
    };
  };
}
