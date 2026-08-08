import type { Database } from '@/integrations/supabase/types';

const GATEWAY_URL = import.meta.env.VITE_API_GATEWAY_URL;

type TableName = keyof Database['public']['Tables'];

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

function applyFilters(data: Record<string, unknown>[], filters: string[]): Record<string, unknown>[] {
  let result = data;
  for (const raw of filters) {
    const filterStr = raw.replace(/^\(|\)$/g, '');

    if (filterStr.startsWith('or=(')) {
      const inner = filterStr.slice(4, -1);
      const orConditions: string[] = [];
      let depth = 0;
      let current = '';
      for (const ch of inner) {
        if (ch === '(') depth++;
        if (ch === ')') depth--;
        if (ch === ',' && depth === 0) {
          orConditions.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }
      if (current.trim()) orConditions.push(current.trim());

      result = result.filter(row => orConditions.some(cond => {
        const pf = parseFilter(cond);
        if (!pf) return true;
        const m = matchFilter(row[pf.col], pf.op, pf.rawVal);
        return pf.negated ? !m : m;
      }));
      continue;
    }

    const pf = parseFilter(filterStr);
    if (!pf) continue;
    const matches = (val: Record<string, unknown>) => {
      const m = matchFilter(val[pf.col], pf.op, pf.rawVal);
      return pf.negated ? !m : m;
    };
    result = result.filter(row => matches(row));
  }
  return result;
}

function matchFilter(value: unknown, op: string, val: string): boolean {
  switch (op) {
    case 'eq': return String(value) === val;
    case 'neq': return String(value) !== val;
    case 'gt': return Number(value) > Number(val);
    case 'gte': return Number(value) >= Number(val);
    case 'lt': return Number(value) < Number(val);
    case 'lte': return Number(value) <= Number(val);
    case 'in': {
      const items = val.replace(/^\(|\)$/g, '').split(',').map(s => s.trim());
      return items.includes(String(value));
    }
    case 'like': {
      const pattern = val.replace(/%/g, '.*');
      return new RegExp(`^${pattern}$`, 'i').test(String(value));
    }
    case 'ilike': {
      const pattern = val.replace(/%/g, '.*');
      return new RegExp(`^${pattern}$`).test(String(value));
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
    const table = header.slice(0, idx).trim();
    const fkName = header.slice(idx + 1).trim();
    const prefix = `${currentTable}_`;
    const suffix = '_fkey';
    let localCol = fkName;
    if (localCol.startsWith(prefix)) localCol = localCol.slice(prefix.length);
    if (localCol.endsWith(suffix)) localCol = localCol.slice(0, -suffix.length);
    return { resultKey: table, relatedTable: table, localCol, relatedCol: 'id', columns, kind: 'one' };
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

      let res = await fetch(url, fetchOptions);

      // Handle 401 - try refresh token and retry
      if (res.status === 401 && token) {
        const sessionStr = localStorage.getItem('tone-auth-token');
        const session = sessionStr ? JSON.parse(sessionStr) : null;

        if (session?.refresh_token) {
          const { data: refreshData } = await gateway.auth.refreshSession();

          if ((refreshData as any)?.session) {
            const newToken = getToken();
            if (newToken && newToken !== token) {
              headers['Authorization'] = `Bearer ${newToken}`;
              res = await fetch(url, { ...fetchOptions, headers });
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

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ message: res.statusText }));
        return { data: null, error: { message: errBody.message || errBody.error || res.statusText, code: String(res.status) } };
      }

      if (res.status === 204) return { data: null, error: null };

      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        return { data: null, error: { message: `Gateway returned non-JSON response (${ct.split(';')[0] || 'unknown content-type'}) for /api/${this._table}`, code: String(res.status) } };
      }

      const json = await res.json();

      if (this._headOnly) {
        return { data: null as unknown as T, error: null };
      }

      // Normalize to array for client-side filtering
      let results: Record<string, unknown>[] = Array.isArray(json)
        ? json as Record<string, unknown>[]
        : json != null
          ? [json as Record<string, unknown>]
          : [];

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
          results = await this._resolveJoins(results, headers);
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

  private async _resolveJoins(results: Record<string, unknown>[], headers: Record<string, string>): Promise<Record<string, unknown>[]> {
    if (!GATEWAY_URL || results.length === 0) return results;

    const entries = parseTopLevelEntries(this._selectCols);
    for (const entry of entries) {
      const spec = parseJoinSpec(entry, this._table);
      if (!spec) continue;

      const keyValues = new Set<string>();
      for (const row of results) {
        const val = row[spec.localCol];
        if (val != null) keyValues.add(String(val));
      }
      if (keyValues.size === 0) continue;

      try {
        const res = await fetch(`${GATEWAY_URL}/api/${spec.relatedTable}`, { headers });
        if (!res.ok) {
          console.warn(`[gateway] Join fetch failed for /api/${spec.relatedTable} (${res.status} ${res.statusText}) — rows will be missing the '${spec.resultKey}' field`);
          continue;
        }
        const json = await res.json();
        let relatedData: Record<string, unknown>[] = Array.isArray(json)
          ? json as Record<string, unknown>[]
          : json != null
            ? [json as Record<string, unknown>]
            : [];

        if (relatedData.length === 0) {
          console.warn(`[gateway] Join /api/${spec.relatedTable} returned no rows for ${keyValues.size} key(s) — rows will be missing the '${spec.resultKey}' field`);
          continue;
        }

        const effectiveIsArray = spec.kind === 'many';

        if (hasNestedJoins(spec.columns)) {
          const nestedFetcher = new PostgrestFilterBuilder(GATEWAY_URL, spec.relatedTable, 'GET');
          (nestedFetcher as any)._selectCols = spec.columns;
          relatedData = await nestedFetcher._resolveJoins(relatedData, headers);
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
      } catch (err) {
        console.warn(`[gateway] Join fetch threw for /api/${spec.relatedTable}:`, err);
        continue;
      }
    }
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
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (options?.contentType) formData.append('contentType', options.contentType);
      if (options?.upsert) formData.append('upsert', 'true');

      const token = getToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

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
      return { data: { path: json.path || path, url: json.url }, error: null };
    } catch (err) {
      return { data: null, error: { message: String(err) } };
    }
  }

  getPublicUrl(path: string): { data: { publicUrl: string } } {
    return {
      data: {
        publicUrl: `${this._baseUrl}/api/storage/${this._bucket}/${path}`,
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
    if (type === 'broadcast' && typeof filter === 'string') {
      this._broadcastListeners.push({ event: filter, callback });
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
      const res = await this._gatewayFetch('user');
      if (!res.ok) return { data: { user: null }, error: null };
      const data = await this._parseJson(res);
      return { data: data.data || data, error: null };
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
