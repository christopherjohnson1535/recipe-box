// Unsaved-form stash in sessionStorage. iOS Safari and installed PWAs never show the beforeunload prompt and in-app
// navigation is not intercepted, so a half-typed recipe is kept here and offered back on the next visit.
// Every access can throw (private mode, blocked storage), so all of it is best-effort.

const key = (id: string) => `rb-draft:${id}`;

export function saveStash(id: string, value: unknown): void {
  try {
    sessionStorage.setItem(key(id), JSON.stringify(value));
  } catch {
    // storage unavailable: the beforeunload guard is still there
  }
}

export function loadStash<T>(id: string): T | null {
  try {
    const raw = sessionStorage.getItem(key(id));
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

export function clearStash(id: string): void {
  try {
    sessionStorage.removeItem(key(id));
  } catch {
    // nothing to clear
  }
}
