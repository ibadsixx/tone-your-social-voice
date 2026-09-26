import type { Database } from '@/integrations/supabase/types';

const GATEWAY_URL = import.meta.env.VITE_API_GATEWAY_URL;

// The gateway stores files in Cloudinary and returns their CDN URL on upload.
// The gateway does not serve GET /api/storage/:bucket/*, so we remember the
// Cloudinary URL and return it from getPublicUrl() instead of a dead URL.
const storageUrlCache = new Map<string, string>();

/**
 * In-flight GET coalescing.
 *
 * The Gateway ignores `select`/`limit`/`offset`/`order` and even equality
 * filters, so `GET /api/<table>` is a whole-table read no matter what the caller
 * asked for. Several components routinely read the same table in the same tick —
 * `Post` calls `useProfile()` once per post, and Layout, Stories and NewPost each
 * read the viewer's own profile too — which turned one feed page into a dozen
 * identical 42 KB table reads.
 *
 * Two properties make this safe to coalesce at all:
 *
 *  - The key is the full request identity: method, URL and the caller's auth
 *    token. The token is in the key, so one viewer's rows can never be handed to
 *    another viewer, and a post-logout read is a different key from a
 *    pre-logout one.
 *  - Entries are dropped as soon as the promise settles. This is NOT a cache: a
 *    later read re-fetches. So a just-accepted friend request, a new post, or a
 *    changed permission is still picked up on the very next read — the staleness
 *    class of bug that a TTL cache would introduce cannot occur.
 *
 * Only the network round trip is shared. Each caller still runs its own column
 * trimming, join resolution and row shaping, and receives a private deep copy of
 * the body, because those steps write onto the rows in place.
 */
type SharedGet = {
  status: number;
  ok: boolean;
  statusText: string;
  contentType: string;
  /** `undefined` when the body was not valid JSON. */
  json: unknown;
  /** True when the body could not be parsed as JSON. */
  jsonFailed: boolean;
};

const inflightGets = new Map<string, Promise<SharedGet | null>>();

/** Request identity for coalescing. Token included so it is never shared across viewers. */
function inflightGetKey(url: string, token: string | null): string {
  return `GET ${url} ${token ?? '<anonymous>'}`;
}

/**
 * Deep copy one row. Falls back to a shallow copy if the body holds something
 * `structuredClone` refuses (a function or a symbol, say — it handles cycles
 * fine, but it does throw `DataCloneError` on non-cloneable values), because a
 * failed clone must not turn a successful read into an error.
 */
function cloneRow<T>(row: T): T {
  try {
    return structuredClone(row);
  } catch {
    if (row && typeof row === 'object') return { ...(row as object) } as T;
    return row;
  }
}

async function sharedGet(url: string, init: RequestInit, token: string | null): Promise<SharedGet | null> {
  const key = inflightGetKey(url, token);
  const existing = inflightGets.get(key);
  if (existing) return existing;

  // A transport failure is deliberately NOT caught here: it rejects, and each
  // awaiting caller falls through to _execute's own catch, so a dropped
  // connection surfaces exactly as it did before coalescing existed.
  const pending = (async (): Promise<SharedGet | null> => {
    const res = await fetch(url, init);
    const contentType = res.headers.get('content-type') || '';
    if (res.status === 204) {
      return { status: 204, ok: res.ok, statusText: res.statusText, contentType, json: undefined, jsonFailed: false };
    }
    let json: unknown;
    let jsonFailed = false;
    try {
      json = await res.json();
    } catch {
      jsonFailed = true;
    }
    return { status: res.status, ok: res.ok, statusText: res.statusText, contentType, json, jsonFailed };
  })();

  inflightGets.set(key, pending);
  // Clear on settle, so nothing is ever served from a stale entry.
  const release = () => { if (inflightGets.get(key) === pending) inflightGets.delete(key); };
  pending.then(release, release);
  return pending;
}

type TableName = keyof Database['public']['Tables'];

/** The two content types that expose paginated reaction-user lists. */
export type ReactionContentType = 'post' | 'comment';

/** Options shared by the dedicated post/comment reaction-user endpoints. */
export interface ReactionUsersOptions {
  /** Ask the gateway for the authorized public profile projection as well as counts. */
  includeUsers?: boolean;
  limit?: number;
  offset?: number;
  /** Canonical reaction key, or a legacy reaction value accepted by the gateway. */
  type?: string;
}

/** The deliberately small, public projection of one reaction author. */
export interface ReactionUser {
  id: string;
  user_id: string;
  reaction_type: string;
  created_at: string | null;
  username: string;
  display_name: string;
  profile_pic: string | null;
}

/** A reaction row that is safe to use for the viewer's own reaction state. */
export interface ReactionViewerRow {
  id: string;
  user_id: string;
  reaction_type: string;
  created_at: string | null;
}

export interface ReactionUsersPage {
  content_type?: ReactionContentType;
  content_id?: string;
  reaction_count: number;
  reaction_types: Record<string, number>;
  filtered_reaction_count: number;
  users: ReactionUser[];
  viewer_reactions: ReactionViewerRow[];
  has_more: boolean;
  next_offset: number | null;
}

export type ReactionUsersResult = {
  data: ReactionUsersPage | null;
  error: { message: string; code?: string } | null;
};

export interface CommentReactionCountSummary {
  reaction_count: number;
  reaction_types: Record<string, number>;
  viewer_reactions: ReactionViewerRow[];
}

export type CommentReactionCountsResult = {
  data: { counts: Record<string, CommentReactionCountSummary> } | null;
  error: { message: string; code?: string } | null;
};

function getToken(): string | null {
  try {
    const sessionStr = localStorage.getItem('tone-auth-token');
    if (sessionStr) {
      const session = JSON.parse(sessionStr);
      return session?.access_token ?? null;
    }
  } catch {
    return null;
  }
  return null;
}

function buildFilterParams(filters: string[]): URLSearchParams {
  const params = new URLSearchParams();
  for (const f of filters) {
    params.append('filter', f);
  }
  return params;
}

// --- Client-side filtering helpers (gateway does not process query params) ---

function parseToken(s: string): string {
  return s.replace(/^['"]|['"]$/g, '');
}

interface ParsedFilter {
  col: string;
  op: string;
  rawVal: string;
  negated: boolean;
}

function parseDotFilter(filterStr: string): ParsedFilter | null {
  let f = filterStr.replace(/^\(|\)$/g, '');
  let negated = false;
  if (f.startsWith('not.')) {
    negated = true;
    f = f.slice(4);
  }
  const firstDot = f.indexOf('.');
  if (firstDot === -1) return null;
  const col = f.slice(0, firstDot);
  const rest = f.slice(firstDot + 1);
  const opDot = rest.indexOf('.');
  if (opDot === -1) return null;
  const op = rest.slice(0, opDot);
  const rawVal = parseToken(rest.slice(opDot + 1));
  return { col, op, rawVal, negated };
}

function parseFilter(filterStr: string): ParsedFilter | null {
  let f = filterStr.replace(/^\(|\)$/g, '');
  let negated = false;
  if (f.startsWith('not.')) {
    negated = true;
    f = f.slice(4);
  }
  const eqIdx = f.indexOf('=');
  if (eqIdx === -1) return null;
  const col = f.slice(0, eqIdx);
  const rest = f.slice(eqIdx + 1);
  const dotIdx = rest.indexOf('.');
  if (dotIdx === -1) return null;
  const op = rest.slice(0, dotIdx);
  const rawVal = parseToken(rest.slice(dotIdx + 1));
  return { col, op, rawVal, negated };
}

// Split an expression string on top-level commas (respects nested parens).
function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of input) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

// Recursively evaluate a PostgREST filter expression against a row.
// Supports simple (col.op.val / not.col.op.val) and nested and(...)/or(...)
// groups. Unknown expressions return true so they never hide rows.
function matchesFilterExpr(expr: string, row: Record<string, unknown>): boolean {
  const e = expr.trim();

  if (e.startsWith('and(') && e.endsWith(')')) {
    return splitTopLevel(e.slice(4, -1)).every(cond => matchesFilterExpr(cond, row));
  }
  if (e.startsWith('or(') && e.endsWith(')')) {
    return splitTopLevel(e.slice(3, -1)).some(cond => matchesFilterExpr(cond, row));
  }

  const pf = parseFilter(e) || parseDotFilter(e);
  if (!pf) return true;
  const m = matchFilter(row[pf.col], pf.op, pf.rawVal);
  return pf.negated ? !m : m;
}

function applyFilters(data: Record<string, unknown>[], filters: string[]): Record<string, unknown>[] {
  let result = data;
  for (const raw of filters) {
    if (raw.startsWith('or=(') && raw.endsWith(')')) {
      const inner = raw.slice(4, -1);
      const orConditions = splitTopLevel(inner);
      result = result.filter(row => orConditions.some(cond => matchesFilterExpr(cond, row)));
      continue;
    }

    if (raw.startsWith('and=(') && raw.endsWith(')')) {
      const inner = raw.slice(5, -1);
      const andConditions = splitTopLevel(inner);
      result = result.filter(row => andConditions.every(cond => matchesFilterExpr(cond, row)));
      continue;
    }

    const filterStr = raw.replace(/^\(|\)$/g, '');
    result = result.filter(row => matchesFilterExpr(filterStr, row));
  }
  return result;
}

function compareValues(a: unknown, b: string): number {
  if (a === null || a === undefined) return -1;
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  const ta = Date.parse(String(a));
  const tb = Date.parse(b);
  if (!Number.isNaN(ta) && !Number.isNaN(tb)) return ta - tb;
  const sa = String(a);
  if (sa < b) return -1;
  if (sa > b) return 1;
  return 0;
}

function matchFilter(value: unknown, op: string, val: string): boolean {
  switch (op) {
    case 'eq': return String(value) === val;
    case 'neq': return String(value) !== val;
    case 'gt': return compareValues(value, val) > 0;
    case 'gte': return compareValues(value, val) >= 0;
    case 'lt': return compareValues(value, val) < 0;
    case 'lte': return compareValues(value, val) <= 0;
    case 'in': {
      const items = val.replace(/^\(|\)$/g, '').split(',').map(s => s.trim());
      return items.includes(String(value));
    }
    case 'like': {
      const pattern = val.replace(/%/g, '.*');
      return new RegExp(`^${pattern}$`).test(String(value));
    }
    case 'ilike': {
      const pattern = val.replace(/%/g, '.*');
      return new RegExp(`^${pattern}$`, 'i').test(String(value));
    }
    case 'is': {
      if (val === 'null') return value === null || value === undefined;
      if (val === 'true') return value === true;
      if (val === 'false') return value === false;
      return String(value) === val;
    }
    default: return true;
  }
}

function parseSelectColumns(selectStr: string): string[] {
  const cols: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of selectStr) {
    if (ch === '(') { depth++; current += ch; }
    else if (ch === ')') { depth--; current += ch; }
    else if (ch === ',' && depth === 0) {
      cols.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) cols.push(current.trim());
  return cols;
}

function hasNestedJoins(selectStr: string): boolean {
  return /\w+!\w+\s*\(/.test(selectStr) || /\w+:\w+\s*\(/.test(selectStr);
}

// --- Client-side join resolution (gateway does not process joins) ---

const FK_TARGETS: Record<string, string> = {
  user_id: 'profiles',
  post_id: 'posts',
  shared_post_id: 'posts',
  group_id: 'groups',
  page_id: 'pages',
  tagged_user_id: 'profiles',
  tagged_by: 'profiles',
  requester_id: 'profiles',
  addressee_id: 'profiles',
  actor_id: 'profiles',
  sender_id: 'profiles',
  receiver_id: 'profiles',
  admin_id: 'profiles',
  creator_id: 'profiles',
  pinned_by: 'profiles',
};

function singularTable(table: string): string {
  if (table === 'posts') return 'post';
  if (table === 'group_posts') return 'group_post';
  if (table === 'post_tags') return 'post_tag';
  if (table === 'post_likes') return 'post_like';
  if (table === 'conversation_participants') return 'conversation_participant';
  if (table.endsWith('ies')) return table.slice(0, -3) + 'y';
  if (table.endsWith('ses') || table.endsWith('xes') || table.endsWith('ches') || table.endsWith('shes')) return table.slice(0, -2);
  if (table.endsWith('s')) return table.slice(0, -1);
  return table;
}

function parseTopLevelEntries(selectStr: string): string[] {
  const entries: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of selectStr) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      entries.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) entries.push(current.trim());
  return entries;
}

interface JoinSpec {
  resultKey: string;
  relatedTable: string;
  localCol: string;
  relatedCol: string;
  columns: string;
  kind: 'one' | 'many';
}

function parseJoinSpec(entry: string, currentTable: string): JoinSpec | null {
  entry = entry.trim();
  if (entry === '*') return null;
  const parenIdx = entry.indexOf('(');
  if (parenIdx === -1) return null;

  const header = entry.slice(0, parenIdx).trim();
  const columns = entry.slice(parenIdx + 1, -1).trim();

  if (header.includes('!')) {
    const idx = header.indexOf('!');
    let tablePart = header.slice(0, idx).trim();
    const fkName = header.slice(idx + 1).trim();

    // Support the full PostgREST shape "alias:table!fk(columns)" — without
    // stripping "alias:", relatedTable becomes "alias:table" and the lookup
    // request 400s, silently leaving rows without the joined field.
    let alias = '';
    const colonIdx = tablePart.indexOf(':');
    if (colonIdx !== -1) {
      alias = tablePart.slice(0, colonIdx).trim();
      tablePart = tablePart.slice(colonIdx + 1).trim();
    }

    const prefix = `${currentTable}_`;
    const suffix = '_fkey';
    let localCol = fkName;
    if (localCol.startsWith(prefix)) localCol = localCol.slice(prefix.length);
    if (localCol.endsWith(suffix)) localCol = localCol.slice(0, -suffix.length);
    return { resultKey: alias || tablePart, relatedTable: tablePart, localCol, relatedCol: 'id', columns, kind: 'one' };
  }

  if (header.includes(':')) {
    const colonIdx = header.indexOf(':');
    const alias = header.slice(0, colonIdx).trim();
    const colPart = header.slice(colonIdx + 1).trim();
    const spaceIdx = colPart.indexOf(' ');
    const localCol = spaceIdx !== -1 ? colPart.slice(0, spaceIdx).trim() : colPart;
    const relatedTable = FK_TARGETS[localCol] || alias;
    const isToOne = localCol.endsWith('_id') || FK_TARGETS[localCol] !== undefined;
    return { resultKey: alias, relatedTable, localCol, relatedCol: 'id', columns, kind: isToOne ? 'one' : 'many' };
  }

  const table = header.trim();
  const singular = singularTable(currentTable);
  const fkCol = `${singular}_id`;
  return { resultKey: table, relatedTable: table, localCol: 'id', relatedCol: fkCol, columns, kind: 'many' };
}

function applyOrder(data: Record<string, unknown>[], order: string): Record<string, unknown>[] {
  if (!order) return data;
  const [col, dir] = order.split('.');
  const asc = dir !== 'desc';
  return [...data].sort((a, b) => {
    const av = a[col] as string | number;
    const bv = b[col] as string | number;
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av < bv) return asc ? -1 : 1;
    if (av > bv) return asc ? 1 : -1;
    return 0;
  });
}

class PostgrestFilterBuilder<T> {
  private _filters: string[] = [];
  private _order: string = '';
  private _limit: number = 0;
  private _offset: number = 0;
  private _rangeStart: number = 0;
  private _rangeEnd: number = 0;
  private _selectCols: string = '*';
  private _single: boolean = false;
  private _maybeSingle: boolean = false;
  private _countOnly: boolean = false;
  private _headOnly: boolean = false;

  constructor(
    private _baseUrl: string,
    private _table: string,
    private _method: string = 'GET',
    private _body?: unknown
  ) {}

  eq(column: string, value: unknown): this { this._filters.push(`${column}=eq.${value}`); return this; }
  neq(column: string, value: unknown): this { this._filters.push(`${column}=neq.${value}`); return this; }
  gt(column: string, value: unknown): this { this._filters.push(`${column}=gt.${value}`); return this; }
  gte(column: string, value: unknown): this { this._filters.push(`${column}=gte.${value}`); return this; }
  lt(column: string, value: unknown): this { this._filters.push(`${column}=lt.${value}`); return this; }
  lte(column: string, value: unknown): this { this._filters.push(`${column}=lte.${value}`); return this; }
  in(column: string, values: unknown[]): this { this._filters.push(`${column}=in.(${values.join(',')})`); return this; }
  like(column: string, pattern: string): this { this._filters.push(`${column}=like.${pattern}`); return this; }
  ilike(column: string, pattern: string): this { this._filters.push(`${column}=ilike.${pattern}`); return this; }
  or(filterString: string): this { this._filters.push(`or=(${filterString})`); return this; }
  not(column: string, op: string, value: unknown): this { this._filters.push(`not.${column}=${op}.${value}`); return this; }
  is(column: string, value: null): this { this._filters.push(`${column}=is.${value}`); return this; }
  order(column: string, opts?: { ascending?: boolean }): this { this._order = `${column}.${opts?.ascending === false ? 'desc' : 'asc'}`; return this; }
  limit(count: number): this { this._limit = count; return this; }
  offset(count: number): this { this._offset = count; return this; }
  range(start: number, end: number): this { this._rangeStart = start; this._rangeEnd = end; return this; }
  select(columns: string = '*', opts?: { count?: string; head?: boolean }): this {
    this._selectCols = columns;
    if (opts?.count) this._countOnly = true;
    if (opts?.head) this._headOnly = true;
    return this;
  }
  single(): this {
    this._single = true;
    this._limit = 1;
    return this;
  }

  maybeSingle(): this {
    this._maybeSingle = true;
    this._limit = 1;
    return this;
  }

  then<TResult1 = { data: T | null; error: { message: string; code?: string } | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: T | null; error: { message: string; code?: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this._execute().then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null
  ): Promise<{ data: T | null; error: { message: string; code?: string } | null } | TResult> {
    return this.then(undefined, onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<{ data: T | null; error: { message: string; code?: string } | null }> {
    return this.then(
      (value) => { onfinally?.(); return value; },
      (reason) => { onfinally?.(); throw reason; }
    );
  }

  private async _execute(): Promise<{ data: T | null; error: { message: string; code?: string } | null }> {
    if (!GATEWAY_URL) {
      return { data: null, error: { message: 'VITE_API_GATEWAY_URL not configured' } };
    }

    try {
      const token = getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      // Gateway only supports single-row updates (PUT /api/v1/:domain/:id).
      // Fall back to update-by-id for bulk updates (no id=eq. filter).
      if (this._method === 'PUT' && !this._filters.some(f => f.startsWith('id=eq.'))) {
        return await this._bulkUpdate(headers);
      }

      let url: string;

      if (this._method === 'GET') {
        const filterParams = new URLSearchParams();
        for (const f of this._filters) {
          filterParams.append('filter', f);
        }
        const qs = filterParams.toString();
        url = `${GATEWAY_URL}/api/${this._table}${qs ? '?' + qs : ''}`;
      } else if (this._method === 'POST') {
        url = `${GATEWAY_URL}/api/${this._table}`;
      } else if (this._method === 'PUT') {
        const id = this._filters.find(f => f.startsWith('id=eq.'))?.split('eq.')[1];
        url = `${GATEWAY_URL}/api/v1/${this._table}/${id}`;
      } else if (this._method === 'DELETE') {
        const idFilter = this._filters.find(f => f.startsWith('id=eq.'));
        if (idFilter) {
          const id = idFilter.split('eq.')[1];
          url = `${GATEWAY_URL}/api/v1/${this._table}/${id}?permanent=true`;
        } else {
          const filterParams = new URLSearchParams();
          for (const f of this._filters) {
            filterParams.append('filter', f);
          }
          filterParams.set('permanent', 'true');
          url = `${GATEWAY_URL}/api/v1/${this._table}?${filterParams.toString()}`;
        }
      } else {
        url = `${GATEWAY_URL}/api/${this._table}`;
      }

      const fetchOptions = {
        method: this._method === 'DELETE' ? 'DELETE' : this._method === 'PUT' ? 'PUT' : this._method,
        headers,
        body: (this._method === 'POST' || this._method === 'PUT') && this._body
          ? JSON.stringify(this._body)
          : undefined,
      };

      if (this._method === 'PUT') {
        console.log(`[gateway] PUT ${url}`, { body: this._body, filters: this._filters });
      }

      // GETs are coalesced: identical concurrent reads of the same table share one
      // network round trip. Everything below is per-caller.
      const isGet = this._method === 'GET';
      let get = isGet ? await sharedGet(url, fetchOptions, token) : null;

      // Handle 401 - try refresh token and retry
      if (isGet && get!.status === 401 && token) {
        const sessionStr = localStorage.getItem('tone-auth-token');
        const session = sessionStr ? JSON.parse(sessionStr) : null;

        if (session?.refresh_token) {
          const { data: refreshData } = await gateway.auth.refreshSession();

          if ((refreshData as any)?.session) {
            const newToken = getToken();
            if (newToken && newToken !== token) {
              headers['Authorization'] = `Bearer ${newToken}`;
              // New token means a new key, so this retry is never shared with the
              // request that failed with 401.
              get = await sharedGet(url, { ...fetchOptions, headers }, newToken);
            }
          } else {
            localStorage.removeItem('tone-auth-token');
            window.location.href = '/auth';
            return { data: null, error: { message: 'Session expired', code: '401' } };
          }
        } else {
          localStorage.removeItem('tone-auth-token');
          window.location.href = '/auth';
          return { data: null, error: { message: 'Session expired', code: '401' } };
        }
      }

      if (isGet) {
        if (get!.status === 204) return { data: null as unknown as T, error: null };

        const ct = get!.contentType;
        // Strictly as before: a missing content-type is treated as a non-JSON
        // response, not waved through.
        if (!ct.includes('application/json')) {
          return { data: null, error: { message: `Gateway returned non-JSON response (${ct.split(';')[0] || 'unknown content-type'}) for /api/${this._table}`, code: String(get!.status) } };
        }
        if (get!.jsonFailed) {
          return { data: null, error: { message: get!.statusText || `Gateway returned an unreadable body for /api/${this._table}`, code: String(get!.status) } };
        }
        if (!get!.ok) {
          const errBody = (get!.json ?? {}) as { message?: string; error?: string };
          return { data: null, error: { message: errBody.message || errBody.error || get!.statusText, code: String(get!.status) } };
        }
      } else {
        const res = await fetch(url, fetchOptions);
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({ message: res.statusText }));
          return { data: null, error: { message: errBody.message || errBody.error || res.statusText, code: String(res.status) } };
        }
        if (res.status === 204) return { data: null as unknown as T, error: null };
        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('application/json')) {
          return { data: null, error: { message: `Gateway returned non-JSON response (${ct.split(';')[0] || 'unknown content-type'}) for /api/${this._table}`, code: String(res.status) } };
        }
        get = { status: res.status, ok: res.ok, statusText: res.statusText, contentType: ct, json: await res.json(), jsonFailed: false };
      }

      const json = get!.json;

      if (this._headOnly) {
        return { data: null as unknown as T, error: null };
      }

      // Normalize to array for client-side filtering.
      //
      // For a coalesced GET the parsed body is shared with every other caller that
      // asked for the same table, and the steps below (column trimming, join
      // resolution) write onto these row objects in place. Hand each caller its
      // own deep copy so one query's resolved joins can never appear in another's
      // results. Cloning a ~40 KB body costs microseconds against a ~300 ms
      // round trip, and it is what makes sharing the read safe.
      let results: Record<string, unknown>[];
      if (Array.isArray(json)) {
        results = isGet
          ? (json as Record<string, unknown>[]).map((row) => cloneRow(row))
          : (json as Record<string, unknown>[]);
      } else if (json != null) {
        const single = json as Record<string, unknown>;
        results = [isGet ? cloneRow(single) : single];
      } else {
        results = [];
      }

      // The Gateway ignores `select`/`limit`/`order`/filters, so this response is
      // every row of `this._table`. Seed the join memo with it so a join back onto
      // the same table — `shared_post:shared_post_id` in the feed select — reuses
      // this response instead of re-reading the whole table. Deliberately
      // unfiltered: a standalone `GET /api/<table>` would have been unfiltered
      // too, so join resolution is unchanged. Scoped to this query, so it can
      // only ever be reused for this caller's own session.
      const joinFetchMemo = new Map<string, Promise<Record<string, unknown>[] | null>>([
        [this._table, Promise.resolve([...results])],
      ]);

      // Client-side filtering (gateway ignores query params)
      if (this._filters.length > 0) {
        results = applyFilters(results, this._filters);
      }

      // Client-side ordering
      results = applyOrder(results, this._order);

      // Client-side pagination
      let offset = this._offset;
      let limit = this._limit;
      if (this._rangeEnd > 0) {
        limit = this._rangeEnd - this._rangeStart + 1;
        offset = this._rangeStart;
      }
      if (offset > 0) results = results.slice(offset);
      if (limit > 0) results = results.slice(0, limit);

      // Count-only mode
      if (this._countOnly) {
        return { data: results.length as unknown as T, error: null };
      }

      // Column selection (gateway returns all fields; pick only requested)
      if (this._selectCols && this._selectCols !== '*') {
        if (hasNestedJoins(this._selectCols)) {
          results = await this._resolveJoins(results, headers, joinFetchMemo);
        } else {
          const cols = parseSelectColumns(this._selectCols);
          results = results.map(row => {
            const picked: Record<string, unknown> = {};
            for (const c of cols) { picked[c] = row[c]; }
            return picked;
          });
        }
      }

      if (this._single) {
        const row = results[0] ?? null;
        return { data: row as T, error: null };
      }

      if (this._maybeSingle) {
        const row = results[0] ?? null;
        return { data: row as T, error: null };
      }

      return { data: results as T, error: null };
    } catch (err) {
      return { data: null, error: { message: String(err) } };
    }
  }

  private async _bulkUpdate(headers: Record<string, string>): Promise<{ data: T | null; error: { message: string; code?: string } | null }> {
    try {
      const fetchOptions = { method: 'GET', headers };
      let res = await fetch(`${GATEWAY_URL}/api/${this._table}`, fetchOptions);

      if (res.status === 401) {
        const { data: refreshData } = await gateway.auth.refreshSession();
        const newToken = getToken();
        if ((refreshData as any)?.session && newToken) {
          headers['Authorization'] = `Bearer ${newToken}`;
          res = await fetch(`${GATEWAY_URL}/api/${this._table}`, { ...fetchOptions, headers });
        } else {
          localStorage.removeItem('tone-auth-token');
          window.location.href = '/auth';
          return { data: null, error: { message: 'Session expired', code: '401' } };
        }
      }

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ message: res.statusText }));
        return { data: null, error: { message: errBody.message || errBody.error || res.statusText, code: String(res.status) } };
      }

      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        return { data: null, error: { message: `Gateway returned non-JSON response for /api/${this._table}`, code: String(res.status) } };
      }

      const json = await res.json();
      const rows: Record<string, unknown>[] = Array.isArray(json)
        ? json as Record<string, unknown>[]
        : json != null
          ? [json as Record<string, unknown>]
          : [];

      const matched = applyFilters(rows, this._filters);

      const ids = matched
        .map((r) => r.id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0);

      for (const id of ids) {
        const putRes = await fetch(`${GATEWAY_URL}/api/v1/${this._table}/${id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(this._body ?? {}),
        });
        if (!putRes.ok) {
          const errBody = await putRes.json().catch(() => ({ message: putRes.statusText }));
          return { data: null, error: { message: errBody.message || errBody.error || putRes.statusText, code: String(putRes.status) } };
        }
      }

      return { data: null, error: null };
    } catch (err) {
      return { data: null, error: { message: String(err) } };
    }
  }

  /**
   * Resolve `select` joins client-side (the Gateway does not process them).
   *
   * Two properties matter for the Home feed's load time, and both were wrong
   * before this change:
   *
   *  - **One request per table, not per join.** `fetchMemo` is created per query
   *    and keyed by table name, so a table reached through several join specs —
   *    or nested inside another join — is read once. The feed's select reaches
   *    `posts` twice (the top-level read and `shared_post:shared_post_id`) and
   *    `profiles` three times (author, comments' author, shared post's author);
   *    that was three redundant full-table round trips per load.
   *
   *  - **Independent tables are read concurrently.** The loop used to `await`
   *    each join in turn, so a five-join select cost five sequential round
   *    trips. Each spec writes only to its own `resultKey`, so resolving them
   *    concurrently is safe.
   *
   * `fetchMemo` carries this caller's `headers`, so a memoized row set can only
   * ever be reused for the same authenticated session within the same query. It
   * is created and discarded inside a single query and is never shared across
   * requests, so it cannot leak one viewer's rows to another.
   */
  private async _resolveJoins(
    results: Record<string, unknown>[],
    headers: Record<string, string>,
    fetchMemo?: Map<string, Promise<Record<string, unknown>[] | null>>
  ): Promise<Record<string, unknown>[]> {
    if (!GATEWAY_URL || results.length === 0) return results;
    const memo = fetchMemo ?? new Map<string, Promise<Record<string, unknown>[] | null>>();

    /** `null` means the read failed; failure is reported once, at the call site. */
    const fetchTable = (table: string): Promise<Record<string, unknown>[] | null> => {
      const existing = memo.get(table);
      if (existing) return existing;
      const pending = (async (): Promise<Record<string, unknown>[] | null> => {
        try {
          const res = await fetch(`${GATEWAY_URL}/api/${table}`, { headers });
          if (!res.ok) {
            console.warn(`[gateway] Join fetch failed for /api/${table} (${res.status} ${res.statusText})`);
            return null;
          }
          const json = await res.json();
          return Array.isArray(json)
            ? json as Record<string, unknown>[]
            : json != null
              ? [json as Record<string, unknown>]
              : [];
        } catch (err) {
          console.warn(`[gateway] Join fetch threw for /api/${table}:`, err);
          return null;
        }
      })();
      memo.set(table, pending);
      return pending;
    };

    const specs = parseTopLevelEntries(this._selectCols)
      .map((entry) => parseJoinSpec(entry, this._table))
      .filter((spec): spec is NonNullable<typeof spec> => spec != null);

    await Promise.all(
      specs.map(async (spec) => {
        const keyValues = new Set<string>();
        for (const row of results) {
          const val = row[spec.localCol];
          if (val != null) keyValues.add(String(val));
        }
        // Nothing in this page references the related table, so skip the read.
        if (keyValues.size === 0) return;

        let relatedData = await fetchTable(spec.relatedTable);
        if (relatedData == null) {
          // The read already reported its own failure; leave the field unset.
          return;
        }
        if (relatedData.length === 0) {
          console.warn(`[gateway] Join /api/${spec.relatedTable} returned no rows for ${keyValues.size} key(s) — rows will be missing the '${spec.resultKey}' field`);
          return;
        }

        const effectiveIsArray = spec.kind === 'many';

        if (hasNestedJoins(spec.columns)) {
          const nestedFetcher = new PostgrestFilterBuilder(GATEWAY_URL, spec.relatedTable, 'GET');
          (nestedFetcher as any)._selectCols = spec.columns;
          // Share the memo so a table nested under two different joins is read once.
          relatedData = await nestedFetcher._resolveJoins(relatedData, headers, memo);
        } else if (spec.columns && spec.columns !== '*') {
          const cols = parseSelectColumns(spec.columns);
          if (!cols.includes(spec.relatedCol)) cols.push(spec.relatedCol);
          relatedData = relatedData.map(row => {
            const picked: Record<string, unknown> = {};
            for (const c of cols) { picked[c] = row[c]; }
            return picked;
          });
        }

        const valToRel = new Map<string, Record<string, unknown>[]>();
        for (const row of relatedData) {
          const val = row[spec.relatedCol];
          if (val == null) continue;
          const key = String(val);
          if (!valToRel.has(key)) valToRel.set(key, []);
          valToRel.get(key)!.push(row);
        }

        const isCount = spec.columns.trim() === 'count';
        let unmatched = 0;
        for (const row of results) {
          const val = row[spec.localCol];
          if (val == null) continue;
          const matches = valToRel.get(String(val));
          if (isCount) {
            row[spec.resultKey] = [{ count: matches ? matches.length : 0 }];
          } else if (matches) {
            row[spec.resultKey] = effectiveIsArray ? matches : matches[0];
          } else {
            unmatched++;
          }
        }
        if (unmatched > 0) {
          console.warn(`[gateway] Join /api/${spec.relatedTable} matched ${keyValues.size - unmatched}/${keyValues.size} key(s) — ${unmatched} row(s) have no '${spec.resultKey}' (${spec.localCol} has no matching ${spec.relatedCol} on ${spec.relatedTable})`);
        }
      })
    );
    return results;
  }
}

class GatewayQueryBuilder<T> {
  private _filters: string[] = [];
  private _order: string = '';
  private _limit: number = 0;
  private _offset: number = 0;
  private _rangeStart: number = 0;
  private _rangeEnd: number = 0;
  private _selectCols: string = '*';
  private _single: boolean = false;
  private _maybeSingle: boolean = false;
  private _countOnly: boolean = false;
  private _headOnly: boolean = false;

  constructor(private _baseUrl: string, private _table: string) {}

  eq(column: string, value: unknown): this { this._filters.push(`${column}=eq.${value}`); return this; }
  neq(column: string, value: unknown): this { this._filters.push(`${column}=neq.${value}`); return this; }
  gt(column: string, value: unknown): this { this._filters.push(`${column}=gt.${value}`); return this; }
  gte(column: string, value: unknown): this { this._filters.push(`${column}=gte.${value}`); return this; }
  lt(column: string, value: unknown): this { this._filters.push(`${column}=lt.${value}`); return this; }
  lte(column: string, value: unknown): this { this._filters.push(`${column}=lte.${value}`); return this; }
  in(column: string, values: unknown[]): this { this._filters.push(`${column}=in.(${values.join(',')})`); return this; }
  like(column: string, pattern: string): this { this._filters.push(`${column}=like.${pattern}`); return this; }
  ilike(column: string, pattern: string): this { this._filters.push(`${column}=ilike.${pattern}`); return this; }
  or(filterString: string): this { this._filters.push(`or=(${filterString})`); return this; }
  not(column: string, op: string, value: unknown): this { this._filters.push(`not.${column}=${op}.${value}`); return this; }
  is(column: string, value: null): this { this._filters.push(`${column}=is.${value}`); return this; }
  order(column: string, opts?: { ascending?: boolean }): this { this._order = `${column}.${opts?.ascending === false ? 'desc' : 'asc'}`; return this; }
  limit(count: number): this { this._limit = count; return this; }
  offset(count: number): this { this._offset = count; return this; }
  range(start: number, end: number): this { this._rangeStart = start; this._rangeEnd = end; return this; }
  single(): this { this._single = true; this._limit = 1; return this; }
  maybeSingle(): this { this._maybeSingle = true; this._limit = 1; return this; }

  select(columns: string = '*', opts?: { count?: string; head?: boolean }): PostgrestFilterBuilder<T> {
    this._selectCols = columns;
    if (opts?.count) this._countOnly = true;
    if (opts?.head) this._headOnly = true;
    const fb = new PostgrestFilterBuilder<T>(this._baseUrl, this._table, 'GET');
    (fb as any)._filters = [...this._filters];
    (fb as any)._order = this._order;
    (fb as any)._limit = this._limit;
    (fb as any)._offset = this._offset;
    (fb as any)._rangeStart = this._rangeStart;
    (fb as any)._rangeEnd = this._rangeEnd;
    (fb as any)._selectCols = this._selectCols;
    (fb as any)._single = this._single;
    (fb as any)._maybeSingle = this._maybeSingle;
    (fb as any)._countOnly = this._countOnly;
    (fb as any)._headOnly = this._headOnly;
    return fb;
  }

  insert(data: unknown): PostgrestFilterBuilder<T> {
    const fb = new PostgrestFilterBuilder<T>(this._baseUrl, this._table, 'POST', data);
    return fb;
  }

  update(data: unknown): PostgrestFilterBuilder<T> {
    const fb = new PostgrestFilterBuilder<T>(this._baseUrl, this._table, 'PUT', data);
    (fb as any)._filters = [...this._filters];
    return fb;
  }

  delete(): PostgrestFilterBuilder<T> {
    const fb = new PostgrestFilterBuilder<T>(this._baseUrl, this._table, 'DELETE');
    (fb as any)._filters = [...this._filters];
    return fb;
  }

  upsert(data: unknown, opts?: { onConflict?: string }): PostgrestFilterBuilder<T> {
    const body = opts?.onConflict ? { ...data as object, _on_conflict: opts.onConflict } : data;
    const fb = new PostgrestFilterBuilder<T>(this._baseUrl, this._table, 'POST', body);
    return fb;
  }
}

class GatewayStorageBucket {
  constructor(
    private _baseUrl: string,
    private _bucket: string
  ) {}

  async upload(
    path: string,
    file: File | Blob,
    options?: { contentType?: string; upsert?: boolean }
  ): Promise<{ data: { path: string; url?: string } | null; error: { message: string } | null }> {
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    // Signed direct upload: the gateway issues a Cloudinary signed-upload URL
    // (it stays the auth + signing choke point) and the browser POSTs the file
    // bytes straight to Cloudinary. Vercel caps serverless request bodies at
    // ~4.5MB, so proxying a full video through the gateway aborts mid-stream
    // and shows as TypeError: Failed to fetch. Falls back to the proxied
    // multipart POST below if signing or the direct upload fails.
    try {
      const signRes = await fetch(`${this._baseUrl}/api/storage/sign`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ bucket: this._bucket, path }),
      });
      if (signRes.ok) {
        const sign = await signRes.json();
        if (sign?.uploadUrl && sign?.apiKey && sign?.timestamp && sign?.folder && sign?.signature) {
          const formData = new FormData();
          // Engineered the same way the gateway's own proxied path does it:
          // the file part carries a real filename (<...>/<uuid>.webm) so
          // Cloudinary's auto-detection classifies the resource type — a bare
          // Blob (filename "blob") can be stored with the wrong resource_type,
          // which makes the delivery URL undecodable in browsers that DO
          // support WebM/Opus (Chrome/Brave).
          formData.append('file', file, path.split('/').pop() || 'upload');
          formData.append('api_key', sign.apiKey);
          formData.append('timestamp', sign.timestamp);
          formData.append('folder', sign.folder);
          formData.append('public_id', sign.publicId || path);
          formData.append('signature', sign.signature);
          if (options?.upsert) formData.append('overwrite', 'true');

          const upRes = await fetch(sign.uploadUrl, { method: 'POST', body: formData });
          const upJson = await upRes.json().catch(() => ({}));
          if (upRes.ok && typeof upJson?.secure_url === 'string') {
            const url = upJson.secure_url;
            storageUrlCache.set(`${this._bucket}/${path}`, url);
            return { data: { path, url }, error: null };
          }
          console.warn('[Gateway] Direct upload to Cloudinary failed, falling back to proxy:', upJson?.error?.message || upRes.statusText);
        }
      }
    } catch (err) {
      console.warn('[Gateway] Signed upload unavailable, falling back to proxy:', err);
    }

    // Fallback: proxied multipart POST through the gateway (small files,
    // payloads under the Vercel body limit, or before the sign endpoint exists).
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (options?.contentType) formData.append('contentType', options.contentType);
      if (options?.upsert) formData.append('upsert', 'true');

      const res = await fetch(`${this._baseUrl}/api/storage/${this._bucket}/${path}`, {
        method: 'POST',
        headers,
        body: formData,
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ message: res.statusText }));
        return { data: null, error: { message: errBody.message || res.statusText } };
      }
      const json = await res.json();
      const url = typeof json?.url === 'string' ? json.url : '';
      if (url) storageUrlCache.set(`${this._bucket}/${path}`, url);
      return { data: { path: json.path || path, url }, error: null };
    } catch (err) {
      return { data: null, error: { message: String(err) } };
    }
  }

  getPublicUrl(path: string): { data: { publicUrl: string } } {
    const cached = storageUrlCache.get(`${this._bucket}/${path}`);
    return {
      data: {
        publicUrl: cached || `${this._baseUrl}/api/storage/${this._bucket}/${path}`,
      },
    };
  }
}

class GatewayStorage {
  constructor(private _baseUrl: string) {}

  from(bucket: string): GatewayStorageBucket {
    return new GatewayStorageBucket(this._baseUrl, bucket);
  }
}

export class GatewayChannel {
  private _channelName: string;
  private _listeners: Array<{ event: string; filter: Record<string, unknown>; callback: (payload: unknown) => void }> = [];
  private _subscribed = false;
  private _pollIntervals: ReturnType<typeof setInterval>[] = [];
  private _broadcastListeners: Array<{ event: string; callback: (payload: unknown) => void }> = [];

  constructor(name: string, _config?: Record<string, unknown>) {
    this._channelName = name;
  }

  on(type: string, filter: Record<string, unknown> | string, callback: (payload: unknown) => void): this {
    if (type === 'broadcast') {
      const event = typeof filter === 'string' ? filter : (filter as Record<string, unknown>).event as string;
      if (event) {
        this._broadcastListeners.push({ event, callback });
      }
    } else if (type === 'postgres_changes') {
      this._listeners.push({ event: (filter as Record<string, unknown>).event as string, filter: filter as Record<string, unknown>, callback });
    }
    return this;
  }

  subscribe(callback?: (status: string) => void): this {
    this._subscribed = true;
    callback?.('SUBSCRIBED');
    return this;
  }

  unsubscribe(): void {
    this._pollIntervals.forEach(clearInterval);
    this._pollIntervals = [];
    this._subscribed = false;
  }

  send(options: { type: string; event: string; payload: unknown }): void {
    if (options.type === 'broadcast') {
      this._broadcastListeners
        .filter(l => l.event === options.event)
        .forEach(l => l.callback({ payload: options.payload }));
    }
  }
}

class GatewayAuth {
  private _listeners: Array<(event: string, session: unknown) => void> = [];
  private _pendingMfa: { factorId: string; mfaSessionId: string } | null = null;

  private _persistSession(session: unknown): void {
    if (session) {
      localStorage.setItem('tone-auth-token', JSON.stringify(session));
    } else {
      localStorage.removeItem('tone-auth-token');
    }
  }

  private async _gatewayFetch(path: string, options: RequestInit = {}): Promise<Response> {
    const token = getToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(options.headers as Record<string, string> || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return fetch(`${GATEWAY_URL}/api/auth/${path}`, { ...options, headers });
  }

  private async _parseJson(res: Response): Promise<any> {
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      throw new Error(`Gateway does not support ${res.url.replace(GATEWAY_URL!, '')} — server returned ${res.status} (${ct.split(';')[0] || 'non-JSON'})`);
    }
    return res.json();
  }

  onAuthStateChange(callback: (event: string, session: unknown) => void): { data: { subscription: { unsubscribe: () => void } } } {
    this._listeners.push(callback);
    this.getSession().then(({ data }) => {
      if (data.session) {
        callback('INITIAL_SESSION', data.session);
      }
    });
    return {
      data: {
        subscription: {
          unsubscribe: () => {
            this._listeners = this._listeners.filter(l => l !== callback);
          },
        },
      },
    };
  }

  async getSession(): Promise<{ data: { session: unknown }; error: { message: string } | null }> {
    try {
      const sessionStr = localStorage.getItem('tone-auth-token');
      if (!sessionStr) return { data: { session: null }, error: null };

      const session = JSON.parse(sessionStr);
      if (!session?.access_token) return { data: { session: null }, error: null };

      if (session.expires_at && Math.floor(Date.now() / 1000) < session.expires_at) {
        return { data: { session }, error: null };
      }

      if (session.refresh_token) {
        const refreshed = await this.refreshSession();
        if (refreshed.data?.session) {
          return refreshed;
        }
      }

      return { data: { session: null }, error: null };
    } catch (error) {
      return { data: { session: null }, error: { message: String(error) } };
    }
  }

  async signUp({ email, password, options }: { email: string; password: string; options?: { data?: Record<string, unknown> } }): Promise<{ data: { user: unknown }; error: { message: string } | null }> {
    try {
      const res = await this._gatewayFetch('sign-up', {
        method: 'POST',
        body: JSON.stringify({ email, password, options }),
      });
      const data = await this._parseJson(res);
      if (!res.ok || data.error) return { data: { user: null }, error: { message: data.error || data.message || 'Sign up failed' } };
      return { data: data.data || data, error: null };
    } catch (error) {
      return { data: { user: null }, error: { message: String(error) } };
    }
  }

  async signInWithPassword({ email, password }: { email: string; password: string }): Promise<{ data: { session: unknown; mfaRequired?: boolean; factorId?: string }; error: { message: string } | null }> {
    try {
      const res = await this._gatewayFetch('sign-in', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      const data = await this._parseJson(res);
      if (!res.ok || data.error) return { data: { session: null }, error: { message: data.error?.message || data.error || data.message || 'Sign in failed' } };

      if (data.data?.session) {
        this._pendingMfa = null;
        this._persistSession(data.data.session);
        this._listeners.forEach(l => l('SIGNED_IN', data.data.session));
        return { data: data.data || data, error: null };
      }

      if (data.data?.mfa_required) {
        this._pendingMfa = { factorId: data.data.factor_id, mfaSessionId: data.data.mfa_session_id };
        return { data: { session: null, mfaRequired: true, factorId: data.data.factor_id }, error: null };
      }

      return { data: data.data || data, error: null };
    } catch (error) {
      return { data: { session: null }, error: { message: String(error) } };
    }
  }

  async signOut(): Promise<{ error: { message: string } | null }> {
    try {
      await this._gatewayFetch('sign-out', { method: 'POST' });
    } catch {
      // Sign out always succeeds
    }
    localStorage.removeItem('tone-auth-token');
    this._listeners.forEach(l => l('SIGNED_OUT', null));
    return { error: null };
  }

  async getUser(): Promise<{ data: { user: unknown }; error: { message: string } | null }> {
    try {
      const res = await this._gatewayFetch('session');
      if (!res.ok) return { data: { user: null }, error: null };
      const data = await this._parseJson(res);
      const user = data?.data?.session?.user ?? data?.data?.user ?? null;
      return { data: { user }, error: null };
    } catch (error) {
      return { data: { user: null }, error: { message: String(error) } };
    }
  }

  async updateUser(attributes: Record<string, unknown>): Promise<{ data: { user: unknown }; error: { message: string } | null }> {
    try {
      const res = await this._gatewayFetch('user', {
        method: 'PUT',
        body: JSON.stringify(attributes),
      });
      const data = await this._parseJson(res);
      if (!res.ok || data.error) return { data: { user: null }, error: { message: data.error || data.message || 'Update failed' } };
      return { data: data.data || data, error: null };
    } catch (error) {
      return { data: { user: null }, error: { message: String(error) } };
    }
  }

  async refreshSession(): Promise<{ data: { session: unknown }; error: { message: string } | null }> {
    try {
      const sessionStr = localStorage.getItem('tone-auth-token');
      const session = sessionStr ? JSON.parse(sessionStr) : null;
      const refreshToken = session?.refresh_token;

      if (!refreshToken) {
        return { data: { session: null }, error: { message: 'No refresh token available' } };
      }

      const res = await fetch(`${GATEWAY_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!res.ok) return { data: { session: null }, error: null };
      const data = await this._parseJson(res);
      if (data.data?.session) {
        this._persistSession(data.data.session);
      }
      return { data: data.data || data, error: null };
    } catch (error) {
      return { data: { session: null }, error: { message: String(error) } };
    }
  }

  get mfa() {
    const authInstance = this;
    return {
      listFactors: async () => {
        const res = await authInstance._gatewayFetch('mfa/factors');
        const data = await authInstance._parseJson(res);
        if (!res.ok || data.error) {
          return { data: { all: [], totp: [] }, error: { message: data.error?.message || data.error || data.message || 'Failed to list factors' } };
        }
        return { data: data.data || data, error: null };
      },
      enroll: async ({ factorType, friendlyName, issuer }: { factorType: string; friendlyName?: string; issuer?: string }) => {
        const res = await authInstance._gatewayFetch('mfa/factors', {
          method: 'POST',
          body: JSON.stringify({ factorType, friendlyName, issuer }),
        });
        const data = await authInstance._parseJson(res);
        if (!res.ok || data.error) {
          return { data: null, error: { message: data.error?.message || data.error || data.message || 'Failed to enroll' } };
        }
        return { data: data.data || data, error: null };
      },
      challenge: async ({ factorId }: { factorId: string }) => {
        const pending = authInstance._pendingMfa;
        const body = pending ? { mfaSessionId: pending.mfaSessionId } : {};
        const res = await authInstance._gatewayFetch(`mfa/factors/${factorId}/challenge`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        const data = await authInstance._parseJson(res);
        if (!res.ok || data.error) {
          return { data: null, error: { message: data.error?.message || data.error || data.message || 'Failed to create challenge' } };
        }
        return { data: data.data || data, error: null };
      },
      verify: async ({ factorId, challengeId, code }: { factorId: string; challengeId: string; code: string }) => {
        const pending = authInstance._pendingMfa;
        const body: Record<string, unknown> = { challengeId, code };
        if (pending) body.mfaSessionId = pending.mfaSessionId;
        const res = await authInstance._gatewayFetch(`mfa/factors/${factorId}/challenge/verify`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        const data = await authInstance._parseJson(res);
        if (!res.ok || data.error) {
          return { data: null, error: { message: data.error?.message || data.error || data.message || 'Verification failed' } };
        }

        // Sign-in flow: GoTrue's verify returns the upgraded AAL2 session.
        if (data.data?.session) {
          authInstance._pendingMfa = null;
          authInstance._persistSession(data.data.session);
          authInstance._listeners.forEach(l => l('SIGNED_IN', data.data.session));
          return { data: { id: factorId }, error: null };
        }

        return { data: data.data || data, error: null };
      },
      unenroll: async ({ factorId }: { factorId: string }) => {
        const res = await authInstance._gatewayFetch(`mfa/factors/${factorId}`, { method: 'DELETE' });
        const data = await authInstance._parseJson(res);
        if (!res.ok || data.error) {
          return { data: null, error: { message: data.error?.message || data.error || data.message || 'Failed to unenroll' } };
        }
        return { data: data.data || data, error: null };
      },
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function countValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : null;
}

function normalizeReactionUsersPage(
  value: unknown,
  includeUsers: boolean,
  requestedType?: string
): ReactionUsersPage {
  const record = isRecord(value) ? value : {};
  const reactionTypes: Record<string, number> = {};

  if (isRecord(record.reaction_types)) {
    for (const [type, rawCount] of Object.entries(record.reaction_types)) {
      const count = countValue(rawCount);
      if (type && count !== null) reactionTypes[type] = count;
    }
  }

  const aggregateCount = countValue(record.reaction_count)
    ?? Object.values(reactionTypes).reduce((sum, count) => sum + count, 0);
  const requestedTypeCount = requestedType ? reactionTypes[requestedType] : undefined;
  const filteredCount = countValue(record.filtered_reaction_count)
    ?? (requestedType ? (requestedTypeCount ?? 0) : aggregateCount);

  const users: ReactionUser[] = [];
  if (includeUsers && Array.isArray(record.users)) {
    for (const rawUser of record.users) {
      if (!isRecord(rawUser)) continue;
      const id = stringValue(rawUser.id);
      const userId = stringValue(rawUser.user_id);
      const reactionType = stringValue(rawUser.reaction_type);
      if (!id || !userId || !reactionType) continue;

      users.push({
        id,
        user_id: userId,
        reaction_type: reactionType,
        created_at: stringValue(rawUser.created_at),
        username: stringValue(rawUser.username) || 'unknown',
        display_name: stringValue(rawUser.display_name) || 'Unknown user',
        profile_pic: stringValue(rawUser.profile_pic),
      });
    }
  }

  const viewerReactions: ReactionViewerRow[] = [];
  if (Array.isArray(record.viewer_reactions)) {
    for (const rawReaction of record.viewer_reactions) {
      if (!isRecord(rawReaction)) continue;
      const id = stringValue(rawReaction.id);
      const userId = stringValue(rawReaction.user_id);
      const reactionType = stringValue(rawReaction.reaction_type);
      if (!id || !userId || !reactionType) continue;
      viewerReactions.push({
        id,
        user_id: userId,
        reaction_type: reactionType,
        created_at: stringValue(rawReaction.created_at),
      });
    }
  }

  const contentType = record.content_type === 'post' || record.content_type === 'comment'
    ? record.content_type
    : undefined;
  const nextOffsetValue = countValue(record.next_offset);

  return {
    ...(contentType ? { content_type: contentType } : {}),
    ...(stringValue(record.content_id) ? { content_id: stringValue(record.content_id)! } : {}),
    reaction_count: aggregateCount,
    reaction_types: reactionTypes,
    filtered_reaction_count: filteredCount,
    users,
    viewer_reactions: viewerReactions,
    has_more: record.has_more === true,
    next_offset: nextOffsetValue,
  };
}

class GatewayClient {
  private _baseUrl: string;
  private _authInstance: GatewayAuth;

  constructor() {
    this._baseUrl = GATEWAY_URL || '';
    this._authInstance = new GatewayAuth();
  }

  from<T extends TableName>(table: T): GatewayQueryBuilder<Database['public']['Tables'][T]['Row']>;
  from(table: string): GatewayQueryBuilder<unknown>;
  from<T extends TableName>(table: T | string): GatewayQueryBuilder<unknown> {
    return new GatewayQueryBuilder<unknown>(this._baseUrl, table as string);
  }

  rpc(functionName: string, params?: Record<string, unknown>): Promise<{ data: unknown; error: { message: string; code?: string } | null }> {
    if (!this._baseUrl) {
      return Promise.resolve({ data: null, error: { message: 'VITE_API_GATEWAY_URL not configured' } });
    }
    const token = getToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    return fetch(`${this._baseUrl}/api/rpc/${functionName}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(params || {}),
    })
      .then(async (res) => {
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({ message: res.statusText }));
          return { data: null, error: { message: errBody.message || errBody.error || res.statusText, code: String(res.status) } };
        }
        const json = await res.json();
        return { data: json, error: null };
      })
      .catch((err) => ({ data: null, error: { message: String(err) } }));
  }

  /**
   * Real server-side totals for a profile's relationships. The friends /
   * following / followers COUNT is public profile metadata (do.md): the
   * gateway returns the actual totals even when the underlying list is not
   * accessible to the viewer, and never ships the individual relationship
   * rows. Counts come from the gateway, NOT from the filtered list arrays.
   */
  relationshipCounts(
    profileId: string
  ): Promise<{
    data: { friends_count: number; following_count: number; followers_count: number } | null;
    error: { message: string; code?: string } | null;
  }> {
    if (!this._baseUrl) {
      return Promise.resolve({ data: null, error: { message: 'VITE_API_GATEWAY_URL not configured' } });
    }
    const token = getToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    return fetch(`${this._baseUrl}/api/profiles/${encodeURIComponent(profileId)}/relationship-counts`, {
      method: 'GET',
      headers,
    })
      .then(async (res) => {
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({ message: res.statusText }));
          return { data: null, error: { message: errBody.message || errBody.error || res.statusText, code: String(res.status) } };
        }
        const json = await res.json();
        return { data: json, error: null };
      })
      .catch((err) => ({ data: null, error: { message: String(err) } }));
  }

  /**
   * Fetch an authorized, paginated reaction-user page. This deliberately does
   * not use the generic table reader: reaction rows contain reactor identities
   * and the gateway must make the visibility decision before returning them.
   */
  private _fetchReactionUsers(
    kind: ReactionContentType,
    contentId: string,
    options: ReactionUsersOptions = {}
  ): Promise<ReactionUsersResult> {
    if (!this._baseUrl || !contentId) {
      return Promise.resolve({ data: null, error: { message: 'VITE_API_GATEWAY_URL not configured' } });
    }

    const includeUsers = options.includeUsers !== false;
    const rawLimit = Number(options.limit);
    const rawOffset = Number(options.offset);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(100, Math.floor(rawLimit))) : 25;
    const offset = Number.isFinite(rawOffset) ? Math.max(0, Math.floor(rawOffset)) : 0;
    const params = new URLSearchParams({
      include_users: String(includeUsers),
      limit: String(limit),
      offset: String(offset),
    });
    if (options.type) params.set('type', options.type);

    const token = getToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    return fetch(
      `${this._baseUrl}/api/${kind === 'post' ? 'posts' : 'comments'}/${encodeURIComponent(contentId)}/reaction-users?${params.toString()}`,
      { method: 'GET', headers, cache: 'no-store' }
    )
      .then(async (res) => {
        if (!res.ok) {
          const errBody = await res.json().catch(() => null);
          const message = isRecord(errBody)
            ? stringValue(errBody.message) || stringValue(errBody.error) || res.statusText
            : res.statusText;
          return {
            data: null,
            error: {
              message: message || `Reaction users request failed (${res.status})`,
              code: String(res.status),
            },
          };
        }

        const json = await res.json();
        return { data: normalizeReactionUsersPage(json, includeUsers, options.type), error: null };
      })
      .catch((err) => ({ data: null, error: { message: String(err) } }));
  }

  postReactionUsers(postId: string, options: ReactionUsersOptions = {}): Promise<ReactionUsersResult> {
    return this._fetchReactionUsers('post', postId, options);
  }

  commentReactionUsers(commentId: string, options: ReactionUsersOptions = {}): Promise<ReactionUsersResult> {
    return this._fetchReactionUsers('comment', commentId, options);
  }

  /** Aggregate-only counts for a batch of comments, plus the viewer's own state. */
  commentReactionCounts(commentIds: string[]): Promise<CommentReactionCountsResult> {
    const ids = [...new Set(commentIds.filter((id) => typeof id === 'string' && id.length > 0))].slice(0, 100);
    if (!this._baseUrl || ids.length === 0) {
      return Promise.resolve({ data: { counts: {} }, error: null });
    }
    const token = getToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const params = new URLSearchParams({ ids: ids.join(',') });
    return fetch(`${this._baseUrl}/api/comments/reaction-counts?${params.toString()}`, {
      method: 'GET',
      headers,
      cache: 'no-store',
    })
      .then(async (res) => {
        if (!res.ok) {
          const errBody = await res.json().catch(() => null);
          const message = isRecord(errBody)
            ? stringValue(errBody.message) || stringValue(errBody.error) || res.statusText
            : res.statusText;
          return {
            data: null,
            error: { message: message || res.statusText, code: String(res.status) },
          };
        }
        const json = await res.json();
        const rawCounts = isRecord(json) && isRecord(json.counts) ? json.counts : {};
        const counts: Record<string, CommentReactionCountSummary> = {};
        for (const [commentId, rawSummary] of Object.entries(rawCounts)) {
          if (!isRecord(rawSummary)) continue;
          const reactionTypes: Record<string, number> = {};
          if (isRecord(rawSummary.reaction_types)) {
            for (const [type, rawCount] of Object.entries(rawSummary.reaction_types)) {
              const count = countValue(rawCount);
              if (type && count !== null) reactionTypes[type] = count;
            }
          }
          const viewerReactions: ReactionViewerRow[] = [];
          if (Array.isArray(rawSummary.viewer_reactions)) {
            for (const rawReaction of rawSummary.viewer_reactions) {
              if (!isRecord(rawReaction)) continue;
              const id = stringValue(rawReaction.id);
              const userId = stringValue(rawReaction.user_id);
              const reactionType = stringValue(rawReaction.reaction_type);
              if (!id || !userId || !reactionType) continue;
              viewerReactions.push({
                id,
                user_id: userId,
                reaction_type: reactionType,
                created_at: stringValue(rawReaction.created_at),
              });
            }
          }
          const aggregate = countValue(rawSummary.reaction_count)
            ?? Object.values(reactionTypes).reduce((sum, count) => sum + count, 0);
          counts[commentId] = {
            reaction_count: aggregate,
            reaction_types: reactionTypes,
            viewer_reactions: viewerReactions,
          };
        }
        return { data: { counts }, error: null };
      })
      .catch((err) => ({ data: null, error: { message: String(err) } }));
  }

  /**
   * Aggregate reaction counts for a post (do.md "Guest users — reaction
   * visibility"): guests see the total + summary icons for public posts even
   * though they cannot read the reactions list (reactor identities) or react.
   * The count is computed server-side, independent of any filtered list, and
   * never ships reaction rows.
   */
  postReactionCount(
    postId: string
  ): Promise<{
    data: { reaction_count: number; reaction_types: Record<string, number> } | null;
    error: { message: string; code?: string } | null;
  }> {
    if (!this._baseUrl) {
      return Promise.resolve({ data: null, error: { message: 'VITE_API_GATEWAY_URL not configured' } });
    }
    const token = getToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    return fetch(`${this._baseUrl}/api/posts/${encodeURIComponent(postId)}/reaction-count`, {
      method: 'GET',
      headers,
    })
      .then(async (res) => {
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({ message: res.statusText }));
          return { data: null, error: { message: errBody.message || errBody.error || res.statusText, code: String(res.status) } };
        }
        const json = await res.json();
        return { data: json, error: null };
      })
      .catch((err) => ({ data: null, error: { message: String(err) } }));
  }

  get storage(): GatewayStorage {
    return new GatewayStorage(this._baseUrl);
  }

  get auth(): GatewayAuth {
    return this._authInstance;
  }

  channel(name: string, config?: Record<string, unknown>): GatewayChannel {
    return new GatewayChannel(name, config);
  }

  removeChannel(channel: GatewayChannel): void {
    channel.unsubscribe();
  }

  removeAllChannels(): void {
    // noop — polling channels clean themselves up
  }
}

export const gateway = new GatewayClient();

// Filter-parsing helpers are exported for unit testing only.
export { applyFilters, matchesFilterExpr, splitTopLevel };
