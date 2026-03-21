import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let tempDir: string;
let mod: typeof import('./session-watcher.js');

beforeEach(async () => {
  vi.resetModules();
  tempDir = await mkdtemp(join(tmpdir(), 'session-watcher-test-'));
  mod = await import('./session-watcher.js');
});

afterEach(async () => {
  mod.stopSessionWatcher();
  await rm(tempDir, { recursive: true, force: true });
});

describe('session-watcher', () => {
  it('calls onChanged when a file is created in the watched directory', async () => {
    const changed = vi.fn();
    mod.startSessionWatcher(tempDir, changed);

    // Allow watcher to initialise (stat + watch are async)
    await sleep(200);

    await writeFile(join(tempDir, 'session.json'), '{}');

    // Wait for debounce (100ms) plus a margin
    await sleep(300);

    expect(changed).toHaveBeenCalled();
  });

  it('debounces multiple rapid changes into one callback', async () => {
    const changed = vi.fn();
    mod.startSessionWatcher(tempDir, changed);
    await sleep(200);

    // Rapid-fire writes
    for (let i = 0; i < 5; i++) {
      await writeFile(join(tempDir, `file-${i}.json`), `{"i":${i}}`);
    }

    await sleep(300);

    // Debouncing should collapse rapid events — expect very few calls
    expect(changed.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(changed.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('stopSessionWatcher cleans up and prevents further callbacks', async () => {
    const changed = vi.fn();
    mod.startSessionWatcher(tempDir, changed);
    await sleep(200);

    mod.stopSessionWatcher();

    await writeFile(join(tempDir, 'after-stop.json'), '{}');
    await sleep(300);

    expect(changed).not.toHaveBeenCalled();
  });

  it('does not crash when the directory does not exist', async () => {
    const changed = vi.fn();
    const nonExistent = join(tempDir, 'does-not-exist');

    // Should not throw
    mod.startSessionWatcher(nonExistent, changed);
    await sleep(200);

    expect(changed).not.toHaveBeenCalled();
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
