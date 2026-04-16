// Global test setup for Vitest and Testing Library.
import '@testing-library/jest-dom/vitest';

// Node 25 ships a built-in `localStorage` global which, without
// `--localstorage-file`, is a broken stub (missing `.clear`). It also shadows
// jsdom's `window.localStorage`. Install a simple in-memory Storage polyfill
// so tests that exercise localStorage behave predictably.
if (typeof window !== 'undefined') {
  function makeStorage(): Storage {
    const data = new Map<string, string>();
    return {
      get length() { return data.size; },
      clear() { data.clear(); },
      getItem(key: string) { return data.has(key) ? data.get(key)! : null; },
      key(index: number) { return Array.from(data.keys())[index] ?? null; },
      removeItem(key: string) { data.delete(key); },
      setItem(key: string, value: string) { data.set(key, String(value)); },
    } as Storage;
  }

  const localStg = makeStorage();
  const sessionStg = makeStorage();

  Object.defineProperty(globalThis, 'localStorage', { value: localStg, writable: true, configurable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { value: sessionStg, writable: true, configurable: true });
  Object.defineProperty(window, 'localStorage', { value: localStg, writable: true, configurable: true });
  Object.defineProperty(window, 'sessionStorage', { value: sessionStg, writable: true, configurable: true });
}
