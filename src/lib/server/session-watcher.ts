import { watch, type FSWatcher } from 'node:fs';
import { stat } from 'node:fs/promises';

let watcher: FSWatcher | null = null;
let debounceTimer: NodeJS.Timeout | null = null;
let watcherGeneration = 0;

const DEBOUNCE_MS = 100;

export function startSessionWatcher(
  sessionStatePath: string,
  onChanged: () => void
): void {
  stopSessionWatcher();
  const generation = ++watcherGeneration;

  stat(sessionStatePath)
    .then((info) => {
      if (generation !== watcherGeneration) {
        return;
      }
      if (!info.isDirectory()) {
        console.warn(
          `[SESSION-WATCHER] path is not a directory: ${sessionStatePath}`
        );
        return;
      }

      try {
        watcher = watch(sessionStatePath, { recursive: true }, () => {
          if (generation !== watcherGeneration) {
            return;
          }
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            if (generation !== watcherGeneration) {
              return;
            }
            debounceTimer = null;
            onChanged();
          }, DEBOUNCE_MS);
        });

        watcher.on('error', (err) => {
          console.error(`[SESSION-WATCHER] watcher error: ${err.message}`);
        });

        console.log(
          `[SESSION-WATCHER] watching ${sessionStatePath} for changes`
        );
      } catch (err) {
        console.error(
          `[SESSION-WATCHER] failed to start watcher: ${err instanceof Error ? err.message : err}`
        );
      }
    })
    .catch(() => {
      console.warn(
        `[SESSION-WATCHER] directory does not exist, skipping: ${sessionStatePath}`
      );
    });
}

export function stopSessionWatcher(): void {
  watcherGeneration += 1;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (watcher) {
    watcher.close();
    watcher = null;
  }
}
