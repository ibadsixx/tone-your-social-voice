#!/usr/bin/env bash
# Mutation harness: every mutant MUST be caught. A test that passes on broken
# code is worse than no test, so each mutation below reintroduces a specific way
# this fix could have been wrong, and the suite is re-run to confirm it fails.
#
# Usage: bash scripts/presence-mutants.sh
set -uo pipefail
cd "$(dirname "$0")/.."

FRONT="npx vitest run src/__tests__/presenceLogout.test.tsx src/__tests__/presenceOnlineIndicator.test.tsx --reporter=basic"
# Absolute, and run with an explicit cwd. The first version of this harness ran
# the gateway suite from the frontend directory, where `src/features/` does not
# exist - so ts-node exited non-zero and every gateway mutant was scored CAUGHT
# without the code ever being mutated. A mutation harness that cannot tell "the
# test caught it" from "the runner could not start" is worse than none.
GW_DIR="$(cd ../gateway && pwd)"
BACK="cd '$GW_DIR' && npx ts-node src/features/presenceTest.ts"

# Prove the harness can tell the two apart before trusting any result: an
# unmutated suite must SURVIVE.
echo "=== harness self-check (both suites must pass unmutated) ==="
run "S1 frontend baseline" SURVIVED bash -c "$FRONT"
run "S2 gateway baseline" SURVIVED bash -c "$BACK"
echo

PASS=0; FAIL=0

# run <label> <expect: CAUGHT|SURVIVED> <cmd...>
run() {
  local label="$1"; shift
  local expect="$1"; shift
  local out
  out=$("$@" 2>&1)
  local rc=$?
  local verdict="SURVIVED"
  if [ $rc -ne 0 ]; then verdict="CAUGHT"; fi
  if [ "$verdict" = "$expect" ]; then
    PASS=$((PASS+1)); printf '  ok   %-58s %s\n' "$label" "$verdict"
  else
    FAIL=$((FAIL+1)); printf '  FAIL %-58s expected %s, got %s\n' "$label" "$expect" "$verdict"
  fi
}

mutate() { # mutate <file> <python-expr-replacing-content>
  python3 - "$1" "$2" <<'PY'
import sys, io
path, expr = sys.argv[1], sys.argv[2]
src = io.open(path, encoding='utf-8').read()
old, new = expr.split('|||')
if old not in src:
    print("MUTATION TARGET NOT FOUND in %s: %r" % (path, old[:80]))
    sys.exit(3)
io.open(path, 'w', encoding='utf-8').write(src.replace(old, new, 1))
PY
}

restore() { git -C "$1" checkout -- "$2"; }

# Mutate/restore with an explicit repository directory. `src/api/routes.ts` and
# `src/features/presence.ts` are gateway paths and do not exist relative to the
# frontend root, so the mutation step has to be told which repo it is editing.
gmutate() { (cd "$GW_DIR" && python3 - "$1" "$2" <<'PY'
import sys, io
path, expr = sys.argv[1], sys.argv[2]
src = io.open(path, encoding='utf-8').read()
old, new = expr.split('|||')
if old not in src:
    print("MUTATION TARGET NOT FOUND in %s: %r" % (path, old[:80]))
    sys.exit(3)
io.open(path, 'w', encoding='utf-8').write(src.replace(old, new, 1))
PY
); }

grestore() { git -C "$GW_DIR" checkout -- "$1"; }

echo "=== frontend mutants ==="

# M1: sign-out no longer removes presence at all. This is the original bug.
mutate src/hooks/useAuth.tsx "    await endPresenceSession();|||"
run "M1 sign-out skips presence removal" CAUGHT bash -c "$FRONT"
restore . src/hooks/useAuth.tsx

# M2: presence removal moved AFTER auth signOut, so the token is already gone.
mutate src/hooks/useAuth.tsx "    await endPresenceSession();

    try {
      const { error } = await gateway.auth.signOut();|||    try {
      const { error } = await gateway.auth.signOut();

    await endPresenceSession();"
run "M2 presence removal after auth signOut" CAUGHT bash -c "$FRONT"
restore . src/hooks/useAuth.tsx

# M3: not awaited, so auth signOut races the marker write.
mutate src/hooks/useAuth.tsx "await endPresenceSession();|||endPresenceSession();"
run "M3 presence removal not awaited" CAUGHT bash -c "$FRONT"
restore . src/hooks/useAuth.tsx

# M4: the pause is dropped, so a heartbeat can overwrite the marker.
mutate src/hooks/usePresence.ts "  presenceWritePaused = true;
  // Two passes|||  // Two passes"
run "M4 heartbeat not paused before the marker" CAUGHT bash -c "$FRONT"
restore . src/hooks/usePresence.ts

# M5: the drain is dropped, so an in-flight heartbeat can land after the marker.
mutate src/hooks/usePresence.ts "  await drainPresenceWrites();
  await drainPresenceWrites();|||"
run "M5 in-flight heartbeats not drained" CAUGHT bash -c "$FRONT"
restore . src/hooks/usePresence.ts

# M6: the marker is written as null, which the reader treats as a redaction.
mutate src/hooks/usePresence.ts "gateway.presenceLogout()|||Promise.resolve({ data: { ok: true, updated: 1 }, error: null })"
run "M6 no logout write reaches the gateway" CAUGHT bash -c "$FRONT"
restore . src/hooks/usePresence.ts

# M7: the reader stops recognising the marker, so it ages out only by timeout.
mutate src/hooks/usePresence.ts "  if (isLoggedOutPresence(lastSeenAt)) return false;
  const seen|||  const seen"
run "M7 reader does not recognise the marker" CAUGHT bash -c "$FRONT"
restore . src/hooks/usePresence.ts

# M8: signing back in does not resume the heartbeat.
mutate src/hooks/usePresence.ts "    presenceWritePaused = false;

    let cancelled = false;|||    let cancelled = false;"
run "M8 signing back in leaves the heartbeat muted" CAUGHT bash -c "$FRONT"
restore . src/hooks/usePresence.ts

# M9: closing a tab is promoted to a logout, breaking the multi-tab rule.
mutate src/hooks/usePresence.ts "      if (presenceWritePaused) return;
      trackPresenceWrite(gateway.presenceHeartbeat()).then(() => undefined);|||      gateway.presenceLogout().then(() => undefined);"
run "M9 closing a tab writes the logout marker" CAUGHT bash -c "$FRONT"
restore . src/hooks/usePresence.ts

# M10: marker rendered as the literal epoch date.
mutate src/hooks/usePresence.ts "  if (isLoggedOutPresence(lastSeenAt)) return 'a while ago';|||"
run "M10 marker renders as the literal epoch date" CAUGHT bash -c "$FRONT"
restore . src/hooks/usePresence.ts

# M11: a user id is sent in the body, enabling force-offline of another account.
mutate src/lib/gateway.ts "      cache: 'no-store',
    })
      .then(async (res) => {
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({ message: res.statusText }));
          return { data: null, error: { message: errBody.message || errBody.error || res.statusText, code: String(res.status) } };
        }
        const json = await res.json().catch(() => null);
        return { data: json, error: null };
      })
      .catch((err) => ({ data: null, error: { message: String(err) } }));
  }

  /**
   * Real server-side totals|||      cache: 'no-store',
    })
      .then(async (res) => {
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({ message: res.statusText }));
          return { data: null, error: { message: errBody.message || errBody.error || res.statusText, code: String(res.status) } };
        }
        const json = await res.json().catch(() => null);
        return { data: json, error: null };
      })
      .catch((err) => ({ data: null, error: { message: String(err) } }));
  }

  /**
   * Real server-side totals"
run "M11 sanity - no-op mutation should survive" SURVIVED bash -c "$FRONT"
restore . src/lib/gateway.ts

echo "=== gateway mutants ==="

# G1: the logout route is not registered, so the client 404s.
gmutate src/api/routes.ts "router.post('/presence/logout', auth.authenticate.bind(auth), async (req: Request, res: Response) => {|||router.post('/presence/logout-disabled', auth.authenticate.bind(auth), async (req: Request, res: Response) => {"
run "G1 logout route not registered" CAUGHT bash -c "$BACK"
grestore src/api/routes.ts

# G2: the logout route takes the id from the body instead of the token.
gmutate src/api/routes.ts "    const outcome = await writePresenceLogout(userId);|||    const outcome = await writePresenceLogout(req.body?.user_id || userId);"
run "G2 logout takes the id from the body" CAUGHT bash -c "$BACK"
grestore src/api/routes.ts

# G3: the logout route drops authentication.
gmutate src/api/routes.ts "router.post('/presence/logout', auth.authenticate.bind(auth), async|||router.post('/presence/logout', async"
run "G3 logout route unauthenticated" CAUGHT bash -c "$BACK"
grestore src/api/routes.ts

# G4: the logout writes the current time, leaving the dot green for the window.
gmutate src/features/presence.ts "  return writePresenceTimestamp(userId, PRESENCE_LOGGED_OUT_AT, deps);|||  return writePresenceTimestamp(userId, new Date().toISOString(), deps);"
run "G4 logout stamps now() instead of the marker" CAUGHT bash -c "$BACK"
grestore src/features/presence.ts

# G5: the logout writes null, which the reader drops as a redaction.
gmutate src/features/presence.ts "  return writePresenceTimestamp(userId, PRESENCE_LOGGED_OUT_AT, deps);|||  return writePresenceTimestamp(userId, null as unknown as string, deps);"
run "G5 logout writes null" CAUGHT bash -c "$BACK"
grestore src/features/presence.ts

# G6: the logout matches on no row, so nothing is written.
gmutate src/features/presence.ts "      .eq('id', userId)
      .select('id');|||      .eq('id', '__never_matches__')
      .select('id');"
run "G6 logout matches no row" CAUGHT bash -c "$BACK"
grestore src/features/presence.ts

# G7: an empty caller id is accepted, writing to an arbitrary id.
gmutate src/features/presence.ts "  if (typeof userId !== 'string' || userId.length === 0) {|||  if (false) {"
run "G7 empty caller id accepted" CAUGHT bash -c "$BACK"
grestore src/features/presence.ts

# G8: failures are swallowed and reported as success - the original invisibility.
gmutate src/features/presence.ts "    return { status: 'written', updated: data?.length ?? 0, lastSeenAt: value };|||    return { status: 'written', updated: 1, lastSeenAt: value };"
run "G8 zero-row write reported as one row" CAUGHT bash -c "$BACK"
grestore src/features/presence.ts

echo
echo "  mutants: $PASS ok, $FAIL unexpected"
[ "$FAIL" -eq 0 ]
