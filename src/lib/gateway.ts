import type { Database } from '@/integrations/supabase/types';

const GATEWAY_URL = import.meta.env.VITE_API_GATEWAY_URL;

type TableName = keyof Database['public']['Tables'];

function getToken(): string | null {
  try {
    const sessionStr = localStorage.getItem('sb-ojdhztcetykgvrcwlwen-auth-token');
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
  if (s.startsWith('(') && s.endsWith(')')) return s.slice(1, -1);
  return s;
}

function matchValue(col: Record<string, unknown>, column: string): unknown {
  return col[column];
}

function compare(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b);
  return String(a).localeCompare(String(b));
}

function applyFilter(data: Record<string, unknown>[], filterStr: string): Record<string, unknown>[] {
  const f = filterStr.trim();
  if (f.startsWith('or=(')) {
    const inner = f.slice(4, -1);
    const tokens: string[] = [];
    let depth = 0;
    let buf = '';
    for (const ch of inner) {
      if (ch === '(') { depth++; buf += ch; }
      else if (ch === ')') { depth--; buf += ch; }
      else if (ch === ',' && depth === 0) { tokens.push(buf); buf = ''; }
      else { buf += ch; }
    }
    if (buf) tokens.push(buf);
    return data.filter(row => tokens.some(t => applyFilter([row], t).length > 0));
  }

  const notEq = f.split('=not.');
  if (notEq.length === 2) {
    const col = notEq[0];
    const rest = notEq[1];
    const dIdx = rest.indexOf('.');
    const op = dIdx >= 0 ? rest.slice(0, dIdx) : rest;
    const val = dIdx >= 0 ? rest.slice(dIdx + 1) : '';
    return data.filter(row => !applySingleFilter(row, col, op, val));
  }

  const eqIdx = f.indexOf('=');
  if (eqIdx < 0) return data;
  const col = f.slice(0, eqIdx);
  const rest = f.slice(eqIdx + 1);
  const dotIdx = rest.indexOf('.');
  if (dotIdx < 0) return data;
  const op = rest.slice(0, dotIdx);
  const val = rest.slice(dotIdx + 1);
  return data.filter(row => applySingleFilter(row, col, op, val));
}

function applySingleFilter(row: Record<string, unknown>, col: string, op: string, val: string): boolean {
  const field = matchValue(row, col);
  switch (op) {
    case 'eq': return String(field) === val;
    case 'neq': return String(field) !== val;
    case 'gt': return compare(field, isNaN(Number(val)) ? val : Number(val)) > 0;
    case 'gte': return compare(field, isNaN(Number(val)) ? val : Number(val)) >= 0;
    case 'lt': return compare(field, isNaN(Number(val)) ? val : Number(val)) < 0;
    case 'lte': return compare(field, isNaN(Number(val)) ? val : Number(val)) <= 0;
    case 'in': {
      const vals = parseToken(val).split(',').map(v => v.trim());
      return vals.includes(String(field));
    }
    case 'like': {
      const pattern = new RegExp('^' + val.replace(/%/g, '.*').replace(/_/g, '.') + '$');
      return pattern.test(String(field ?? ''));
    }
    case 'ilike': {
      const pattern = new RegExp('^' + val.replace(/%/g, '.*').replace(/_/g, '.') + '$', 'i');
      return pattern.test(String(field ?? ''));
    }
    case 'is': return val === 'null' ? field == null : field != null;
    default: return true;
  }
}

function applyFilters(data: Record<string, unknown>[], filters: string[]): Record<string, unknown>[] {
  let result = data;
  for (const f of filters) {
    const key = f.startsWith('filter=') ? f.slice(7) : f;
    result = applyFilter(result, key);
  }
  return result;
}

function applyOrder(data: Record<string, unknown>[], order: string): Record<string, unknown>[] {
  if (!order) {
    return data.slice().sort((a, b) => {
      const ac = a.created_at as string | undefined;
      const bc = b.created_at as string | undefined;
      if (ac && bc) return bc.localeCompare(ac);
      return 0;
    });
  }
  const [col, dir] = order.split('.');
  const desc = dir === 'desc';
  return data.slice().sort((a, b) => {
    const r = compare(a[col], b[col]);
    return desc ? -r : r;
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
  private _resolved: boolean = false;
  private _resolveFn: ((value: unknown) => void) | null = null;
  private _rejectFn: ((reason: unknown) => void) | null = null;

  constructor(
    private _baseUrl: string,
    private _table: string,
    private _method: string = 'GET',
    private _body?: unknown
  ) {}

  eq(column: string, value: unknown): this {
    this._filters.push(`${column}=eq.${value}`);
    return this;
  }

  neq(column: string, value: unknown): this {
    this._filters.push(`${column}=neq.${value}`);
    return this;
  }

  gt(column: string, value: unknown): this {
    this._filters.push(`${column}=gt.${value}`);
    return this;
  }

  gte(column: string, value: unknown): this {
    this._filters.push(`${column}=gte.${value}`);
    return this;
  }

  lt(column: string, value: unknown): this {
    this._filters.push(`${column}=lt.${value}`);
    return this;
  }

  lte(column: string, value: unknown): this {
    this._filters.push(`${column}=lte.${value}`);
    return this;
  }

  in(column: string, values: unknown[]): this {
    this._filters.push(`${column}=in.(${values.join(',')})`);
    return this;
  }

  like(column: string, pattern: string): this {
    this._filters.push(`${column}=like.${pattern}`);
    return this;
  }

  ilike(column: string, pattern: string): this {
    this._filters.push(`${column}=ilike.${pattern}`);
    return this;
  }

  or(filterString: string): this {
    this._filters.push(`or=(${filterString})`);
    return this;
  }

  not(column: string, op: string, value: unknown): this {
    this._filters.push(`${column}=not.${op}.${value}`);
    return this;
  }

  is(column: string, value: null): this {
    this._filters.push(`${column}=is.${value}`);
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }): this {
    const dir = opts?.ascending === false ? 'desc' : 'asc';
    this._order = `${column}.${dir}`;
    return this;
  }

  limit(count: number): this {
    this._limit = count;
    return this;
  }

  offset(count: number): this {
    this._offset = count;
    return this;
  }

  range(start: number, end: number): this {
    this._rangeStart = start;
    this._rangeEnd = end;
    return this;
  }

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

      let url: string;

      if (this._method === 'GET') {
        // Gateway does not process filter/order/limit/offset params.
        // Fetch all records, then apply filtering/sorting/pagination client-side.
        url = `${GATEWAY_URL}/api/${this._table}`;
      } else if (this._method === 'POST') {
        url = `${GATEWAY_URL}/api/${this._table}`;
      } else if (this._method === 'PUT') {
        const id = this._filters.find(f => f.startsWith('id=eq.'))?.split('eq.')[1];
        url = `${GATEWAY_URL}/api/v1/${this._table}/${id}`;
      } else if (this._method === 'DELETE') {
        const id = this._filters.find(f => f.startsWith('id=eq.'))?.split('eq.')[1];
        url = `${GATEWAY_URL}/api/v1/${this._table}/${id}?permanent=true`;
      } else {
        url = `${GATEWAY_URL}/api/${this._table}`;
      }

      const res = await fetch(url, {
        method: this._method === 'DELETE' ? 'DELETE' : this._method === 'PUT' ? 'PUT' : this._method,
        headers,
        body: (this._method === 'POST' || this._method === 'PUT') && this._body
          ? JSON.stringify(this._body)
          : undefined,
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ message: res.statusText }));
        return { data: null, error: { message: errBody.message || errBody.error || res.statusText, code: String(res.status) } };
      }

      if (res.status === 204) return { data: null, error: null };

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

      // Column selection
      if (this._selectCols && this._selectCols !== '*') {
        const cols = this._selectCols.split(',').map(c => c.trim());
        results = results.map(row => {
          const picked: Record<string, unknown> = {};
          for (const c of cols) { picked[c] = row[c]; }
          return picked;
        });
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
  not(column: string, op: string, value: unknown): this { this._filters.push(`${column}=not.${op}.${value}`); return this; }
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
    options?: { contentType?: string; upsert?: boolean; cacheControl?: string }
  ): Promise<{ data: { path: string } | null; error: { message: string } | null }> {
    if (!this._baseUrl) {
      return { data: null, error: { message: 'VITE_API_GATEWAY_URL not configured' } };
    }
    try {
      const token = getToken();
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bucket', this._bucket);
      formData.append('path', path);
      if (options?.contentType) formData.append('contentType', options.contentType);
      if (options?.upsert) formData.append('upsert', 'true');

      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${this._baseUrl}/api/storage/upload`, {
        method: 'POST',
        headers,
        body: formData,
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ message: res.statusText }));
        return { data: null, error: { message: errBody.message || res.statusText } };
      }
      const json = await res.json();
      return { data: { path: json.path || path }, error: null };
    } catch (err) {
      return { data: null, error: { message: String(err) } };
    }
  }

  getPublicUrl(path: string): { data: { publicUrl: string } } {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://ojdhztcetykgvrcwlwen.supabase.co';
    return {
      data: {
        publicUrl: `${supabaseUrl}/storage/v1/object/public/${this._bucket}/${path}`,
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

class GatewayChannel {
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

  onAuthStateChange(callback: (event: string, session: unknown) => void): { data: { subscription: { unsubscribe: () => void } } } {
    this._listeners.push(callback);
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
    return { data: { session: null }, error: { message: 'Auth not configured — gateway has no auth endpoints' } };
  }

  async signUp(_credentials: unknown): Promise<{ data: { user: unknown }; error: { message: string } | null }> {
    return { data: { user: null }, error: { message: 'Auth not configured — gateway has no auth endpoints' } };
  }

  async signInWithPassword(_credentials: unknown): Promise<{ data: { session: unknown }; error: { message: string } | null }> {
    return { data: { session: null }, error: { message: 'Auth not configured — gateway has no auth endpoints' } };
  }

  async signOut(): Promise<{ error: { message: string } | null }> {
    return { error: null };
  }

  async getUser(): Promise<{ data: { user: unknown }; error: { message: string } | null }> {
    return { data: { user: null }, error: { message: 'Auth not configured — gateway has no auth endpoints' } };
  }

  async updateUser(_attributes: unknown): Promise<{ data: { user: unknown }; error: { message: string } | null }> {
    return { data: { user: null }, error: { message: 'Auth not configured — gateway has no auth endpoints' } };
  }

  async refreshSession(): Promise<{ data: { session: unknown }; error: { message: string } | null }> {
    return { data: { session: null }, error: { message: 'Auth not configured — gateway has no auth endpoints' } };
  }

  get mfa() {
    return {
      listFactors: async () => ({ data: { totp: [] }, error: null }),
      enroll: async () => ({ data: null, error: { message: 'MFA not configured' } }),
      challenge: async () => ({ data: null, error: { message: 'MFA not configured' } }),
      verify: async () => ({ data: null, error: { message: 'MFA not configured' } }),
      unenroll: async () => ({ data: null, error: { message: 'MFA not configured' } }),
    };
  }
}

class GatewayClient {
  private _baseUrl: string;

  constructor() {
    this._baseUrl = GATEWAY_URL || '';
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
    return new GatewayAuth();
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
