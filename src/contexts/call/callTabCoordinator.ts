export const CALL_ACTIVE_STORAGE_KEY = 'tone-call-active-count';
export const CALL_RESOLVED_STORAGE_KEY = 'tone-call-resolved';

// A call entry is considered stale (owning tab crashed/killed without cleanup)
// if it has not been heartbeated for this long. Real calls heartbeat every 15s,
// so 75s tolerates several missed beats before self-healing.
const STALE_AFTER_MS = 75_000;

interface CallActiveEntry {
  count: number;
  ts: number;
}

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

function readEntry(userId?: string | null): CallActiveEntry | null {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    // Current format: JSON {count, ts}. Legacy format was a bare number string
    // written by tabs that could later crash without cleanup — treat any legacy
    // value as already stale so permanently-stuck users self-heal on load.
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.count === 'number' && typeof parsed?.ts === 'number') {
        return parsed;
      }
    } catch {
      // not JSON — fall through to legacy handling
    }
    const legacyCount = parseInt(raw, 10) || 0;
    return legacyCount > 0 ? { count: legacyCount, ts: 0 } : null;
  } catch {
    return null;
  }
}

function writeEntry(entry: CallActiveEntry | null, userId?: string | null) {
  try {
    const key = storageKey(userId);
    if (!entry || entry.count <= 0) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(entry));
    }
  } catch {
    // localStorage unavailable (private mode, SSR) — degrade to per-tab behavior.
  }
}

function isStale(entry: CallActiveEntry): boolean {
  return Date.now() - entry.ts > STALE_AFTER_MS;
}

// Cross-tab coordination so multiple tabs of the same user don't all ring for
// one incoming call and don't both accept it. Uses a localStorage counter keyed
// by userId, shared across tabs of the same origin; other tabs are notified via
// the `storage` event when the counter changes.
//
// Entries carry a heartbeat timestamp: a tab that crashes mid-call can never run
// its cleanup, which used to leave the counter stuck >0 forever and made every
// incoming call auto-reply busy. Stale entries are cleared on read instead.
export const callTabCoordinator = {
  isActive(userId?: string | null): boolean {
    const entry = readEntry(userId);
    if (!entry) return false;
    if (isStale(entry)) {
      console.warn('[CallTabs] Stale active-call entry cleared (no heartbeat for >75s)');
      writeEntry(null, userId);
      return false;
    }
    return true;
  },

  enterCall(userId?: string | null) {
    const entry = readEntry(userId);
    const count = entry && !isStale(entry) ? entry.count : 0;
    writeEntry({ count: count + 1, ts: Date.now() }, userId);
  },

  // Refreshes the liveness timestamp while a call is ongoing. Called on an
  // interval by CallContext for as long as the local call state is non-idle.
  heartbeat(userId?: string | null) {
    const entry = readEntry(userId);
    if (entry && !isStale(entry)) {
      writeEntry({ ...entry, ts: Date.now() }, userId);
    }
  },

  exitCall(userId?: string | null) {
    const entry = readEntry(userId);
    if (!entry) return;
    const count = isStale(entry) ? 0 : Math.max(0, entry.count - 1);
    writeEntry(count > 0 ? { count, ts: Date.now() } : null, userId);
  },
};
