#!/usr/bin/env bash
# Mutation harness: every mutant MUST be caught. A test that passes on broken
# code is worse than no test, so each mutation below reintroduces a specific way
# this fix could have been wrong, and the suite is re-run to confirm it fails.
#
# Usage: bash scripts/presence-mutants.sh
set -uo pipefail
cd "$(dirname "$0")/.."

# No `--reporter` flag: vitest 4 removed `basic`, and an unknown reporter makes the
# runner exit non-zero BEFORE running anything. Since this harness reads "non-zero
# exit" as "the mutant was caught", that turned every frontend result into a false
# CAUGHT - a test suite that cannot run is indistinguishable from one that failed a
# test, which is the same class of mistake as running the gateway suite from the
# wrong directory. The self-check below is what exposed it.
FRONT="npx vitest run src/__tests__/presenceLogout.test.tsx src/__tests__/presenceOnlineIndicator.test.tsx src/__tests__/presenceStaleDot.test.tsx"
# Absolute, and run with an explicit cwd. The first version of this harness ran
# the gateway suite from the frontend directory, where `src/features/` does not
# exist - so ts-node exited non-zero and every gateway mutant was scored CAUGHT
# without the code ever being mutated. A mutation harness that cannot tell "the
# test caught it" from "the runner could not start" is worse than none.
GW_DIR="$(cd ../gateway && pwd)"
BACK="cd '$GW_DIR' && npx ts-node src/features/presenceTest.ts"

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

# Prove the harness can tell the two apart before trusting any result: an
# unmutated suite must SURVIVE. (This check has to come AFTER `run` is defined -
# the first version of this harness put it first, so the function was not yet in
# scope, and the check silently did nothing.)
echo "=== harness self-check (both suites must pass unmutated) ==="
run "S1 frontend baseline" SURVIVED bash -c "$FRONT"
run "S2 gateway baseline" SURVIVED bash -c "$BACK"
echo

mutate() { # mutate <file> <old|||new>
  python3 - "$1" "$2" <<'PY'
import sys, io
path, expr = sys.argv[1], sys.argv[2]
src = io.open(path, encoding='utf-8').read()
old, new = expr.split('|||')
# A literal backslash-n in the shell argument means "newline" - the mutants are
# multi-line and `\n` inside a double-quoted string is NOT expanded by bash, so
# without this every multi-line target would silently fail to match.
old = old.replace('\\n', '\n'); new = new.replace('\\n', '\n')
if old not in src:
    print("MUTATION TARGET NOT FOUND in %s: %r" % (path, old[:120]))
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
old = old.replace('\\n', '\n'); new = new.replace('\\n', '\n')
if old not in src:
    print("MUTATION TARGET NOT FOUND in %s: %r" % (path, old[:120]))
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

# M7: drop the explicit marker check from `isOnline`.
#
# EXPECTED TO SURVIVE, and that is the point of listing it. With the epoch as the
# marker, `Date.now() - 0` is already outside any plausible freshness window, so
# the comparison alone answers "offline" and removing the guard changes no
# behaviour. The guard is kept anyway (see the note in usePresence.ts): it is the
# only thing that keeps logout correct if the marker is ever backdated to restore
# last-seen precision, which is the obvious next change and would silently put
# logged-out users back to green. Recorded as SURVIVED so the redundancy stays
# documented and cannot be mistaken for load-bearing coverage.
mutate src/hooks/usePresence.ts "  if (isLoggedOutPresence(lastSeenAt)) return false;
  const seen|||  const seen"
run "M7 reader drops the explicit marker check (redundant today)" SURVIVED bash -c "$FRONT"
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

# M11: a user id is sent in the request body, which would let the caller name
# whose presence to remove. The gateway ignores it, but the client must not offer
# it - the "no id in the body" assertion has to bite.
mutate src/lib/gateway.ts "    return fetch(\`\${this._baseUrl}/api/presence/logout\`, {\n      method: 'POST',\n      headers,|||    return fetch(\`\${this._baseUrl}/api/presence/logout\`, {\n      method: 'POST',\n      headers,\n      body: JSON.stringify({ user_id: 'someone-else' }),"
run "M11 logout sends a user id in the body" CAUGHT bash -c "$FRONT"
restore . src/lib/gateway.ts

# M12: the marker write is moved inside the interval, so it fires repeatedly
# rather than once per sign-out. The "exactly one call" assertion must bite.
mutate src/hooks/usePresence.ts "      trackPresenceWrite(gateway.presenceHeartbeat()).then(() => undefined);|||      trackPresenceWrite(gateway.presenceHeartbeat()).then(() => undefined);\n      gateway.presenceLogout().then(() => undefined);"
run "M12 the marker is written on a timer, not once per sign-out" CAUGHT bash -c "$FRONT"
restore . src/hooks/usePresence.ts

# M13-M19: the lower bound on the freshness comparison. `isOnline` used to ask only
# `Date.now() - seen < OFFLINE_THRESHOLD_MS`, which nothing in it could reject for
# being from the FUTURE - a negative age satisfies a positive threshold, so a
# reader whose clock is behind the gateway's saw every partner green with no upper
# limit at all. These seven are the ways the bound can be wrong.

# M13: the bound removed outright. This is the original defect.
mutate src/hooks/usePresence.ts "  if (age < -MAX_CLOCK_SKEW_MS) return false;
  return age < OFFLINE_THRESHOLD_MS;|||  return age < OFFLINE_THRESHOLD_MS;"
run "M13 freshness comparison has no lower bound" CAUGHT bash -c "$FRONT"
restore . src/hooks/usePresence.ts

# M14: the sign is flipped, so the bound rejects a slightly STALE stamp instead of
# a future one - an inversion that would gray out a partner who just heartbeated.
mutate src/hooks/usePresence.ts "if (age < -MAX_CLOCK_SKEW_MS) return false;|||if (age < MAX_CLOCK_SKEW_MS) return false;"
run "M14 lower bound sign flipped" CAUGHT bash -c "$FRONT"
restore . src/hooks/usePresence.ts

# M15: the tolerance widened to 15 minutes - the number in the bug report, which
# would reintroduce the symptom at a smaller scale while looking like a fix.
mutate src/hooks/usePresence.ts "MAX_CLOCK_SKEW_MS = 60000|||MAX_CLOCK_SKEW_MS = 15 * 60 * 1000"
run "M15 skew tolerance widened to 15 minutes" CAUGHT bash -c "$FRONT"
restore . src/hooks/usePresence.ts

# M16: the UPPER bound widened to 15 minutes. do.md rules out buying a fix with a
# timeout, and the arithmetic test has to notice the window growing at all.
mutate src/hooks/usePresence.ts "OFFLINE_THRESHOLD_MS = 150000|||OFFLINE_THRESHOLD_MS = 15 * 60 * 1000"
run "M16 freshness window widened to 15 minutes" CAUGHT bash -c "$FRONT"
restore . src/hooks/usePresence.ts

# M17: the label's future guard loses its skew clause, so a stamp from the future
# reads "Just now" forever beside a dot `isOnline` has already called gray.
mutate src/hooks/usePresence.ts "if (Number.isNaN(diffMs) || diffMs < -MAX_CLOCK_SKEW_MS) return 'Offline';|||if (Number.isNaN(diffMs)) return 'Offline';"
run "M17 formatLastSeen loses the future-stamp guard" CAUGHT bash -c "$FRONT"
restore . src/hooks/usePresence.ts

# M18: the whole guard goes, so an unparseable timestamp renders "Invalid Date"
# and a future one renders "Just now" forever.
mutate src/hooks/usePresence.ts "  if (Number.isNaN(diffMs) || diffMs < -MAX_CLOCK_SKEW_MS) return 'Offline';
|||"
run "M18 formatLastSeen guard removed entirely" CAUGHT bash -c "$FRONT"
restore . src/hooks/usePresence.ts

# M19: off-by-one on the bound. The tolerance is a MAXIMUM lead, so a stamp exactly
# MAX_CLOCK_SKEW_MS ahead is admissible and one millisecond further is not; an
# off-by-one in either direction silently changes which of those two is online.
mutate src/hooks/usePresence.ts "if (age < -MAX_CLOCK_SKEW_MS) return false;|||if (age < -MAX_CLOCK_SKEW_MS - 1) return false;"
run "M19 lower bound off-by-one" CAUGHT bash -c "$FRONT"
restore . src/hooks/usePresence.ts

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
