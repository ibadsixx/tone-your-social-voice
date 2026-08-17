export const CALL_ACTIVE_STORAGE_KEY = 'tone-call-active-count';
export const CALL_RESOLVED_STORAGE_KEY = 'tone-call-resolved';

// Written (with a fresh timestamp) whenever any tab rejects or ends an incoming
// call, so other tabs that are still ringing can stop.
export function markCallResolved() {
  try {
    localStorage.setItem(CALL_RESOLVED_STORAGE_KEY, String(Date.now()));
  } catch {
    // localStorage unavailable — ignore.
  }
}

// Scope the active-call counter by userId so that different users logged in on
// the same origin (e.g. two browser tabs with different accounts) don't block
// each other's incoming calls.
function storageKey(userId?: string | null): string {
  return userId ? `${CALL_ACTIVE_STORAGE_KEY}:${userId}` : CALL_ACTIVE_STORAGE_KEY;
}

function readCount(userId?: string | null): number {
  try {
    return parseInt(localStorage.getItem(storageKey(userId)) || '0', 10) || 0;
  } catch {
    return 0;
  }
}

function writeCount(count: number, userId?: string | null) {
  try {
    const key = storageKey(userId);
    if (count <= 0) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, String(count));
    }
  } catch {
    // localStorage unavailable (private mode, SSR) — degrade to per-tab behavior.
  }
}

// Cross-tab coordination so multiple tabs of the same user don't all ring for
// one incoming call and don't both accept it. Uses a localStorage counter keyed
// by userId, which is shared across tabs of the same origin; other tabs are
// notified via the `storage` event when the counter changes.
export const callTabCoordinator = {
  isActive(userId?: string | null): boolean {
    return readCount(userId) > 0;
  },

  enterCall(userId?: string | null) {
    writeCount(readCount(userId) + 1, userId);
  },

  exitCall(userId?: string | null) {
    writeCount(Math.max(0, readCount(userId) - 1), userId);
  },
};
