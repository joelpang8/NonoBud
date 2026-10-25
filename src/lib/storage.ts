/**
 * Guarded localStorage for small per-device conveniences only (like which
 * player this phone belongs to before accounts exist). Never game progress.
 */
export function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode or storage blocked: the app still works, it just won't remember */
  }
}
