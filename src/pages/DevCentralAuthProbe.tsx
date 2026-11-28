// TEMPORARY — development-only Central Auth / Profiles compatibility probe.
// This page is dynamically imported only when import.meta.env.DEV is true.
// It must be removed in a later cleanup phase after the user has run it.

import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  runCentralAuthProbe,
  type CentralAuthProbeResult,
} from '@/lib/diagnostics/centralAuthProbe';
import {
  runProfilesIdentityProbe,
  type ProfilesIdentityProbeResult,
} from '@/lib/diagnostics/profilesIdentityProbe';

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 py-2 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-mono text-sm">{value}</span>
    </div>
  );
}

function ProbeResults({ result }: { result: CentralAuthProbeResult }) {
  return (
    <div className="mt-5 space-y-5">
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide">Session</h2>
        <ResultRow label="Availability" value={result.session} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide">
          1. JWT metadata shape
        </h2>
        <ResultRow label="Algorithm category" value={result.jwtMetadata.algorithmCategory} />
        <ResultRow label="kid" value={result.jwtMetadata.kid} />
        <ResultRow label="iss" value={result.jwtMetadata.iss} />
        <ResultRow label="role" value={result.jwtMetadata.role} />
        <ResultRow label="sub" value={result.jwtMetadata.sub} />
        <ResultRow label="aud" value={result.jwtMetadata.aud} />
        <ResultRow label="exp" value={result.jwtMetadata.exp} />
        <ResultRow label="iat" value={result.jwtMetadata.iat} />
        <p className="mt-2 text-xs text-muted-foreground">{result.interpretation.note}</p>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide">
          2. Public JWKS key match
        </h2>
        <ResultRow label="kid resolves in public JWKS" value={result.jwksKeyMatch} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide">
          3. Profiles request acceptance
        </h2>
        <ResultRow label="HTTP status" value={result.profilesAcceptance.httpStatus} />
        <ResultRow label="Row visibility" value={result.profilesAcceptance.rowVisibility} />
        {result.profilesAcceptance.errorClass ? (
          <ResultRow label="Error class" value={result.profilesAcceptance.errorClass} />
        ) : null}
        {result.profilesAcceptance.errorCode ? (
          <ResultRow label="Error code" value={result.profilesAcceptance.errorCode} />
        ) : null}
        <p className="mt-2 text-xs text-muted-foreground">{result.profilesAcceptance.note}</p>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide">
          4. Overall interpretation
        </h2>
        <ResultRow label="JWT metadata shape" value={result.interpretation.metadataShape} />
        <ResultRow label="JWKS key match" value={result.interpretation.jwksMatch} />
        <ResultRow label="Profiles request" value={result.interpretation.profilesRequest} />
        <ResultRow
          label="Evidence sufficient to proceed"
          value={result.interpretation.sufficientEvidence}
        />
      </section>
    </div>
  );
}

const DevCentralAuthProbe = () => {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CentralAuthProbeResult | null>(null);
  const [probeFailed, setProbeFailed] = useState(false);
  const [identityRunning, setIdentityRunning] = useState(false);
  const [identityResult, setIdentityResult] = useState<ProfilesIdentityProbeResult | null>(null);

  const run = useCallback(async () => {
    setRunning(true);
    setResult(null);
    setProbeFailed(false);
    try {
      const next = await runCentralAuthProbe();
      setResult(next);
    } catch {
      // No raw error is rendered or logged.
      setProbeFailed(true);
    } finally {
      setRunning(false);
    }
  }, []);

  const runIdentity = useCallback(async () => {
    setIdentityRunning(true);
    setIdentityResult(null);
    try {
      // The helper allow-lists three booleans and a status; no token or claim
      // is returned to this component.
      setIdentityResult(await runProfilesIdentityProbe());
    } finally {
      setIdentityRunning(false);
    }
  }, []);

  if (!import.meta.env.DEV) return null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-amber-600">
          Development only — temporary diagnostic
        </p>
        <h1 className="text-2xl font-semibold">Central Auth / Profiles Compatibility Check</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This check runs only when you click the button. It displays sanitized status values
          only. It does not display tokens, profile data, user IDs, usernames, or email addresses.
        </p>

        <Button className="mt-5" onClick={run} disabled={running}>
          {running ? 'Running…' : 'Run Central Auth / Profiles Compatibility Check'}
        </Button>

        <div className="mt-4 border-t border-border/60 pt-4">
          <p className="text-sm text-muted-foreground">
            Temporary database-side identity check. Requires explicit approval and installation of
            the probe function in the Profiles project.
          </p>
          <Button
            className="mt-3"
            onClick={runIdentity}
            disabled={identityRunning}
            data-testid="run-profiles-identity-probe"
          >
            {identityRunning ? 'Running…' : 'Run Profiles Identity Probe'}
          </Button>
        </div>

        {identityResult ? (
          <section className="mt-5 space-y-2" data-testid="profiles-identity-result">
            <h2 className="text-sm font-semibold uppercase tracking-wide">5. Profiles identity probe</h2>
            <ResultRow
              label="identity_available"
              value={String(identityResult.identity_available)}
            />
            <ResultRow label="issuer_matches" value={String(identityResult.issuer_matches)} />
            <ResultRow label="user_id_is_uuid" value={String(identityResult.user_id_is_uuid)} />
            <ResultRow label="Status" value={identityResult.status} />
          </section>
        ) : null}

        {probeFailed ? (
          <p className="mt-4 font-mono text-sm" role="status">
            PROBE_ERROR
          </p>
        ) : null}

        {result ? <ProbeResults result={result} /> : null}
      </div>
    </main>
  );
};

export default DevCentralAuthProbe;
