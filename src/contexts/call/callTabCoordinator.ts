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

function readCount(): number {
  try {
    return parseInt(localStorage.getItem(CALL_ACTIVE_STORAGE_KEY) || '0', 10) || 0;
  } catch {
    return 0;
  }
}

function writeCount(count: number) {
  try {
    if (count <= 0) {
      localStorage.removeItem(CALL_ACTIVE_STORAGE_KEY);
    } else {
      localStorage.setItem(CALL_ACTIVE_STORAGE_KEY, String(count));
    }
  } catch {
    // localStorage unavailable (private mode, SSR) — degrade to per-tab behavior.
  }
}

// Cross-tab coordination so multiple tabs of the same user don't all ring for
// one incoming call and don't both accept it. Uses a localStorage counter, which
// is shared across tabs of the same origin; other tabs are notified via the
// `storage` event when the counter changes.
export const callTabCoordinator = {
  isActive(): boolean {
    return readCount() > 0;
  },

  enterCall() {
    writeCount(readCount() + 1);
  },

  exitCall() {
    writeCount(Math.max(0, readCount() - 1));
  },
};
