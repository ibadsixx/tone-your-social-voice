// Phase 3G-Q1 contract tests for the staged, proposal-only SQL revision.
// These are source-level checks only. No SQL is executed and no database is
// contacted.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SQL_PATH = resolve(
  __dirname,
  '..',
  '..',
  '..',
  'TONE_PHASE_3G_Q1_PROFILE_ABOUT_FIELD_READ_PROPOSAL.sql'
);

const raw = readFileSync(SQL_PATH, 'utf8');
const executable = raw
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

function between(startMarker: string, endMarker: string): string {
  const start = raw.indexOf(startMarker);
  const end = raw.indexOf(endMarker, start + startMarker.length);
  expect(start, `missing marker ${startMarker}`).toBeGreaterThan(-1);
  expect(end, `missing marker ${endMarker}`).toBeGreaterThan(start);
  return raw.slice(start, end);
}

describe('Phase 3G-Q1 SQL proposal', () => {
  it('is explicitly proposal-only and keeps DDL commented out', () => {
    expect(raw).toContain('DO NOT EXECUTE');
    expect(raw).toContain('No SQL in this file has been executed');

    const firstDdl = raw.indexOf('CREATE OR REPLACE FUNCTION');
    const firstBlock = raw.indexOf('/*');
    const firstBlockEnd = raw.indexOf('*/', firstBlock);
    expect(firstDdl).toBeGreaterThan(firstBlock);
    expect(firstDdl).toBeLessThan(firstBlockEnd);

    expect(executable).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION/i);
  });

  it('documents the corrected live type evidence', () => {
    expect(raw).toContain('malformed array literal');
    expect(raw).toContain('email text[]');
    expect(raw).toContain('websites_social_links jsonb');
    expect(raw).toContain('birth_date date');
    expect(raw).toContain('birth_year integer');
    expect(raw).toContain('company_id uuid');
  });

  it('separates Phase A, Phase B, and Phase C', () => {
    expect(raw).toContain('PHASE A — VERIFIED OWNER-ONLY ABOUT READ');
    expect(raw).toContain('PHASE B — GUEST PUBLIC ABOUT READ');
    expect(raw).toContain('PHASE C — FRIENDS AND BLOCKING AUTHORIZATION');

    const phaseC = between('PHASE C — FRIENDS AND BLOCKING AUTHORIZATION', '4. READ-ONLY POST-APPLICATION VERIFICATION');
    expect(phaseC).not.toContain('CREATE OR REPLACE FUNCTION');
    expect(phaseC).toContain('No DDL is provided here');
  });

  it('derives owner identity from trusted Central Auth, with no browser id', () => {
    const phaseA = between('PHASE A — VERIFIED OWNER-ONLY ABOUT READ', 'PHASE B — GUEST PUBLIC ABOUT READ');

    expect(phaseA).toContain('get_own_profile_about_fields()');
    expect(phaseA).toContain('v_viewer := auth.uid()');
    expect(phaseA).toContain('<VERIFIED_CENTRAL_AUTH_ISSUER>');
    expect(phaseA).toContain("SET search_path = ''");
    expect(phaseA).toContain('SECURITY DEFINER');
    expect(phaseA).toContain('WHERE p.id = v_viewer');
    expect(phaseA).not.toMatch(/get_own_profile_about_fields\s*\(\s*p_/i);

    // Owner reads must not wait on unproven relationship sources.
    for (const term of ['is_blocked', 'is_friend', 'get_block_relation', 'is_restricted']) {
      expect(phaseA, `Phase A must not use ${term}`).not.toContain(term);
    }
  });

  it('keeps guests public-only and authenticated non-owners fail-closed', () => {
    const phaseB = between('PHASE B — GUEST PUBLIC ABOUT READ', 'PHASE C — FRIENDS AND BLOCKING AUTHORIZATION');

    expect(phaseB).toContain('get_public_profile_about_fields(p_profile_id uuid)');
    expect(phaseB).toContain('IF auth.uid() IS NOT NULL THEN');
    expect(phaseB).toContain("= 'public'");
    expect(phaseB).not.toContain('p.username');
    expect(phaseB).not.toContain('p_viewer_id');
  });

  it('never returns rowtypes, visibility columns, private grants, or cross-project SQL', () => {
    expect(executable).not.toMatch(/\bSELECT\s+\*/i);
    expect(executable).not.toMatch(/RETURNS\s+SETOF\s+profiles/i);
    expect(executable).not.toMatch(/GRANT\s+SELECT/i);
    expect(raw).not.toMatch(/\b(dblink|postgres_fdw)\b/i);

    const outputBlock = raw.slice(raw.indexOf('RETURNS TABLE ('), raw.indexOf('LANGUAGE plpgsql'));
    for (const visibilityColumn of [
      'about_you_visibility',
      'email_visibility',
      'phone_visibility',
      'relationship_visibility',
    ]) {
      expect(outputBlock, `visibility column ${visibilityColumn} must not be an output`).not.toContain(
        visibilityColumn
      );
    }
  });
});
