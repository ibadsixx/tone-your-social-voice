// Tone frontend — direct Supabase data client.
//
// This is the only application data client. Tables and RPCs are routed through
// the registry resolver to one active project, and every request carries the
// central Auth JWT so project RLS policies authorize it. Cross-project work is
// delegated to narrowly scoped Edge Functions, never to the abandoned Gateway.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  clearClientCache,
  getClientForRoute,
  getProjectClient,
} from './clientFactory';
import { resolveRpcRoute, resolveTableRoute } from './routing';
import { callEdgeFunction } from './crossProject';
import * as centralAuth from './centralAuth';
import type { OperationType } from './types';
import type { UpdateUserOptions } from './centralAuth';

export type ReactionContentType = 'post' | 'comment';

export interface ReactionUsersOptions {
  limit?: number;
  offset?: number;
  includeUsers?: boolean;
  type?: string;
}

export interface ReactionUser {
  id: string;
  user_id: string;
  reaction_type: string;
  created_at?: string;
  username?: string;
  display_name?: string;
  profile_pic?: string | null;
}

export interface ReactionViewerRow {
  id: string;
  user_id: string;
  reaction_type: string;
  created_at?: string;
}

export interface ReactionUsersPage {
  content_type?: ReactionContentType;
  content_id?: string;
  filtered_reaction_count?: number;
  users: ReactionUser[];
  viewer_reactions: ReactionViewerRow[];
  reaction_count: number;
  reaction_types: Record<string, number>;
  has_more: boolean;
  next_offset: number | null;
}

export type ReactionUsersResult = {
  data: ReactionUsersPage | null;
  error: QueryErrorInfo | null;
};

export interface CommentReactionCountSummary {
  reaction_count: number;
  reaction_types: Record<string, number>;
  viewer_reactions: ReactionViewerRow[];
}

export type CommentReactionCountsResult = {
  data: { counts: Record<string, CommentReactionCountSummary> } | null;
  error: QueryErrorInfo | null;
};

export interface QueryErrorInfo {
  message: string;
  code?: string;
  name?: string;
  /** Deterministic routing/config failure code, preserved from the resolver. */
  configCode?: string;
}

export interface QueryResult<T> {
  data: T | null;
  error: QueryErrorInfo | null;
  count?: number | null;
  status?: number;
  statusText?: string;
}

/** Public result shape used by the api modules. */
export type ApiResult<T> = QueryResult<T>;

type QueryError = QueryErrorInfo | null;

function normalizeError(error: unknown): QueryError {
  if (!error) return null;
  if (typeof error !== 'object') return { message: String(error) };
  const value = error as {
    message?: unknown;
    code?: unknown;
    name?: unknown;
    configCode?: unknown;
  };
  const configCode = typeof value.configCode === 'string' ? value.configCode : undefined;
  return {
    message: typeof value.message === 'string' ? value.message : String(error),
    code: value.code != null ? String(value.code) : undefined,
    ...(value.name != null ? { name: String(value.name) } : {}),
    ...(configCode ? { configCode } : {}),
  };
}

function parseTopLevelEntries(select: string): string[] {
  const entries: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of select) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      entries.push(current.trim());
      current = '';
    } else current += ch;
  }
  if (current.trim()) entries.push(current.trim());
  return entries;
}

function hasNestedJoins(select: string): boolean {
  return /\w+!\w+\s*\(/.test(select) || /\w+:\w+\s*\(/.test(select) || /^\w+\s*\(/.test(select);
}

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
  if (table.endsWith('ies')) return `${table.slice(0, -3)}y`;
  if (table.endsWith('ses') || table.endsWith('xes') || table.endsWith('ches') || table.endsWith('shes')) {
    return table.slice(0, -2);
  }
  if (table.endsWith('s')) return table.slice(0, -1);
  return table;
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
  const parenIdx = entry.indexOf('(');
  if (parenIdx === -1) return null;

  const header = entry.slice(0, parenIdx).trim();
  const columns = entry.slice(parenIdx + 1, -1).trim();

  if (header.includes('!')) {
    const fkIndex = header.indexOf('!');
    let tablePart = header.slice(0, fkIndex).trim();
    const fkName = header.slice(fkIndex + 1).trim();
    let alias = '';
    const colonIndex = tablePart.indexOf(':');
    if (colonIndex !== -1) {
      alias = tablePart.slice(0, colonIndex).trim();
      tablePart = tablePart.slice(colonIndex + 1).trim();
    }

    const suffix = '_fkey';
    const currentPrefix = `${currentTable}_`;
    const relatedPrefix = `${tablePart}_`;

    if (fkName.startsWith(currentPrefix)) {
      let localCol = fkName.slice(currentPrefix.length);
      if (localCol.endsWith(suffix)) localCol = localCol.slice(0, -suffix.length);
      return { resultKey: alias || tablePart, relatedTable: tablePart, localCol, relatedCol: 'id', columns, kind: 'one' };
    }
    if (tablePart !== currentTable && fkName.startsWith(relatedPrefix)) {
      let relatedCol = fkName.slice(relatedPrefix.length);
      if (relatedCol.endsWith(suffix)) relatedCol = relatedCol.slice(0, -suffix.length);
      return { resultKey: alias || tablePart, relatedTable: tablePart, localCol: 'id', relatedCol, columns, kind: 'many' };
    }
    let localCol = fkName;
    if (localCol.endsWith(suffix)) localCol = localCol.slice(0, -suffix.length);
    return { resultKey: alias || tablePart, relatedTable: tablePart, localCol, relatedCol: 'id', columns, kind: 'one' };
  }

  if (header.includes(':')) {
    const colonIndex = header.indexOf(':');
    const alias = header.slice(0, colonIndex).trim();
    const colPart = header.slice(colonIndex + 1).trim();
    const spaceIndex = colPart.indexOf(' ');
    const localCol = spaceIndex === -1 ? colPart : colPart.slice(0, spaceIndex).trim();
    const relatedTable = FK_TARGETS[localCol] || alias;
    const isToOne = localCol.endsWith('_id') || FK_TARGETS[localCol] !== undefined;
    return { resultKey: alias, relatedTable, localCol, relatedCol: 'id', columns, kind: isToOne ? 'one' : 'many' };
  }

  const fkCol = `${singularTable(currentTable)}_id`;
  return { resultKey: header, relatedTable: header, localCol: 'id', relatedCol: fkCol, columns, kind: 'many' };
}

type FilterCall = { method: string; args: unknown[] };

// The query object is a thenable with the same ergonomics as the removed
// Gateway builder. Its payload is intentionally `any` at the compatibility
// boundary: callers cast to their published API result type, and Supabase's
// generated row types do not model the cross-domain joins used by this app.
class DirectQueryBuilder<T = any> implements Promise<any> {
  readonly [Symbol.toStringTag] = 'Promise' as const;

  private filters: FilterCall[] = [];
  // PostgREST accepts multiple order clauses and applies them in insertion
  // order. Keyset pagination needs both created_at and id so rows sharing a
  // timestamp still have a total order; storing only the last `.order()` call
  // would silently make the cursor ambiguous.
  private orderBy: { column: string; ascending: boolean }[] = [];
  private limitCount: number | null = null;
  private offsetCount = 0;
  private rangeBounds: [number, number] | null = null;
  private selectColumns = '*';
  private selectRequested = false;
  private countOptions: { count?: string; head?: boolean } | null = null;
  private singleResult = false;
  private maybeSingleResult = false;

  constructor(
    private readonly table: string,
    private readonly method: 'select' | 'insert' | 'update' | 'delete' | 'upsert',
    private readonly body?: unknown,
    private readonly upsertOptions?: { onConflict?: string }
  ) {
    if (method === 'select') this.selectRequested = true;
  }

  private filter(method: string, ...args: unknown[]): this {
    this.filters.push({ method, args });
    return this;
  }

  insert(data: unknown): DirectQueryBuilder<T> {
    return new DirectQueryBuilder<T>(this.table, 'insert', data);
  }

  update(data: unknown): DirectQueryBuilder<T> {
    return new DirectQueryBuilder<T>(this.table, 'update', data);
  }

  delete(): DirectQueryBuilder<T> {
    return new DirectQueryBuilder<T>(this.table, 'delete');
  }

  upsert(data: unknown, options?: { onConflict?: string }): DirectQueryBuilder<T> {
    return new DirectQueryBuilder<T>(this.table, 'upsert', data, options);
  }

  eq(column: string, value: unknown): this { return this.filter('eq', column, value); }
  neq(column: string, value: unknown): this { return this.filter('neq', column, value); }
  gt(column: string, value: unknown): this { return this.filter('gt', column, value); }
  gte(column: string, value: unknown): this { return this.filter('gte', column, value); }
  lt(column: string, value: unknown): this { return this.filter('lt', column, value); }
  lte(column: string, value: unknown): this { return this.filter('lte', column, value); }
  in(column: string, values: unknown[]): this { return this.filter('in', column, values); }
  like(column: string, pattern: string): this { return this.filter('like', column, pattern); }
  ilike(column: string, pattern: string): this { return this.filter('ilike', column, pattern); }
  or(filter: string): this { return this.filter('or', filter); }
  not(column: string, op: string, value: unknown): this { return this.filter('not', column, op, value); }
  is(column: string, value: unknown): this { return this.filter('is', column, value); }

  order(column: string, options?: { ascending?: boolean }): this {
    this.orderBy.push({ column, ascending: options?.ascending !== false });
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  offset(count: number): this {
    this.offsetCount = count;
    return this;
  }

  range(start: number, end: number): this {
    this.rangeBounds = [start, end];
    return this;
  }

  select(columns = '*', options?: { count?: string; head?: boolean }): this {
    this.selectColumns = columns;
    this.selectRequested = true;
    if (options) this.countOptions = options;
    return this;
  }

  single(): this {
    this.singleResult = true;
    return this;
  }

  maybeSingle(): this {
    this.maybeSingleResult = true;
    return this;
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null
  ): Promise<any> {
    return this.execute().catch(onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<any> {
    return this.execute().finally(onfinally);
  }

  private applyFilters(builder: any): void {
    for (const { method, args } of this.filters) {
      if (typeof builder[method] !== 'function') {
        throw new Error(`Unsupported query filter: ${method}`);
      }
      builder = builder[method](...args);
    }
  }

  private async execute(): Promise<QueryResult<T>> {
    try {
      const operation: OperationType = this.method === 'select' ? 'read' : 'write';
      const route = await resolveTableRoute(this.table, operation);
      const client = await getClientForRoute(route);
      const joins = this.selectRequested && hasNestedJoins(this.selectColumns);
      const primarySelect = joins
        ? parseTopLevelEntries(this.selectColumns).filter((entry) => !entry.includes('(')).join(',') || '*'
        : this.selectColumns;

      let builder: any = client.from(this.table);

      switch (this.method) {
        case 'select':
          builder = builder.select(primarySelect, this.countOptions ?? undefined);
          break;
        case 'insert':
          builder = builder.insert(this.body);
          if (this.selectRequested) builder = builder.select(primarySelect);
          break;
        case 'update':
          builder = builder.update(this.body);
          break;
        case 'delete':
          builder = builder.delete();
          break;
        case 'upsert':
          builder = builder.upsert(this.body, this.upsertOptions ?? {});
          if (this.selectRequested) builder = builder.select(primarySelect);
          break;
      }

      this.applyFilters(builder);

      if (this.method === 'update' && this.selectRequested) {
        builder = builder.select(primarySelect);
      }
      if (this.method === 'delete' && this.selectRequested) {
        builder = builder.select(primarySelect);
      }

      for (const order of this.orderBy) {
        builder = builder.order(order.column, { ascending: order.ascending });
      }
      if (this.rangeBounds) builder = builder.range(this.rangeBounds[0], this.rangeBounds[1]);
      else if (this.limitCount != null) builder = builder.limit(this.limitCount);
      // maybeSingle avoids PostgREST's "multiple/zero rows" error while keeping
      // the null-on-empty behavior callers already rely on.
      if (this.singleResult || this.maybeSingleResult) builder = builder.maybeSingle();

      const result = await builder;
      if (result.error) return { data: null, error: normalizeError(result.error) };

      if (this.countOptions?.count && !this.countOptions.head) {
        return { data: result.count as unknown as T, error: null };
      }
      if (this.countOptions?.head) {
        return { data: null, error: null };
      }

      let data: any = result.data ?? null;
      if (this.offsetCount > 0 && Array.isArray(data)) data = data.slice(this.offsetCount);

      if (joins && data != null) {
        const rows = Array.isArray(data) ? data : [data];
        await resolveJoins(rows, this.selectColumns, this.table, new Map());
        data = Array.isArray(result.data) ? rows : rows[0] ?? null;
      }

      return { data: data as T, error: null };
    } catch (error) {
      return { data: null, error: normalizeError(error) };
    }
  }
}

async function resolveJoins(
  rows: Record<string, any>[],
  select: string,
  currentTable: string,
  memo: Map<string, Promise<Record<string, any>[]>>
): Promise<Record<string, any>[]> {
  if (rows.length === 0) return rows;

  const specs = parseTopLevelEntries(select)
    .filter((entry) => entry.includes('('))
    .map((entry) => parseJoinSpec(entry, currentTable))
    .filter((spec): spec is JoinSpec => spec !== null);

  await Promise.all(
    specs.map(async (spec) => {
      const keys = new Set<string>();
      for (const row of rows) {
        const value = row[spec.localCol];
        if (value != null) keys.add(String(value));
      }
      if (keys.size === 0) return;

      const memoKey = `${spec.relatedTable}:${spec.relatedCol}:${[...keys].sort().join(',')}`;
      let pending = memo.get(memoKey);
      if (!pending) {
        pending = (async () => {
          const route = await resolveTableRoute(spec.relatedTable, 'read');
          const client = await getClientForRoute(route);
          const columns = hasNestedJoins(spec.columns) ? '*' : '*';
          const { data, error } = await client
            .from(spec.relatedTable)
            .select(columns)
            .in(spec.relatedCol, [...keys]);
          if (error || !Array.isArray(data)) {
            console.warn('[dataClient] join read failed', spec.relatedTable, normalizeError(error)?.message);
            return [];
          }
          const relatedRows = data as Record<string, any>[];
          if (hasNestedJoins(spec.columns)) {
            await resolveJoins(relatedRows, spec.columns, spec.relatedTable, memo);
          } else if (spec.columns && spec.columns !== '*' && spec.columns !== 'count') {
            const pickedColumns = parseTopLevelEntries(spec.columns);
            if (!pickedColumns.includes(spec.relatedCol)) pickedColumns.push(spec.relatedCol);
            for (const row of relatedRows) {
              for (const key of Object.keys(row)) {
                if (!pickedColumns.includes(key)) delete row[key];
              }
            }
          }
          return relatedRows;
        })();
        memo.set(memoKey, pending);
      }

      const relatedRows = await pending;
      const byKey = new Map<string, Record<string, any>[]>();
      for (const row of relatedRows) {
        const value = row[spec.relatedCol];
        if (value == null) continue;
        const key = String(value);
        const bucket = byKey.get(key) ?? [];
        bucket.push(row);
        byKey.set(key, bucket);
      }

      for (const row of rows) {
        const value = row[spec.localCol];
        if (value == null) continue;
        const matches = byKey.get(String(value)) ?? [];
        if (spec.columns.trim() === 'count') row[spec.resultKey] = [{ count: matches.length }];
        else if (matches.length > 0) row[spec.resultKey] = spec.kind === 'many' ? matches : matches[0];
      }
    })
  );

  return rows;
}

const BUCKET_DOMAINS: Record<string, string> = {
  avatars: 'profiles',
  covers: 'profiles',
  profile_photos: 'profiles',
  editor_videos: 'editor_projects',
  message_attachments: 'messages',
  stories: 'stories',
  reels: 'posts',
};

function bucketDomain(bucket: string): string {
  return BUCKET_DOMAINS[bucket] ?? bucket;
}

class DirectStorageBucket {
  private clientPromise: Promise<{ client: SupabaseClient; baseUrl: string }> | null = null;
  private resolvedBaseUrl: string | null = null;

  constructor(private readonly bucket: string) {}

  private getClient(): Promise<{ client: SupabaseClient; baseUrl: string }> {
    if (!this.clientPromise) {
      this.clientPromise = getProjectClient({
        domain: bucketDomain(this.bucket),
        operation: 'write',
      }).then(({ route, client }) => {
        this.resolvedBaseUrl = route.project.project_url.replace(/\/$/, '');
        return { client, baseUrl: this.resolvedBaseUrl };
      });
    }
    return this.clientPromise;
  }

  async upload(
    path: string,
    file: File | Blob,
    options?: { contentType?: string; upsert?: boolean; cacheControl?: string }
  ): Promise<QueryResult<{ path: string; url?: string }>> {
    const { client } = await this.getClient();
    const { data, error } = await client.storage
      .from(this.bucket)
      .upload(path, file, {
        contentType: options?.contentType,
        upsert: options?.upsert ?? false,
        cacheControl: options?.cacheControl ?? '3600',
      });
    if (error) return { data: null, error: normalizeError(error) };
    return { data: { path: data?.path ?? path, url: undefined }, error: null };
  }

  async list(path?: string, options?: { limit?: number; offset?: number; sortBy?: { column: string; order: string } }): Promise<QueryResult<any[]>> {
    const { client } = await this.getClient();
    const { data, error } = await client.storage.from(this.bucket).list(path, options);
    if (error) return { data: null, error: normalizeError(error) };
    return { data: data ?? [], error: null };
  }

  async remove(paths: string[]): Promise<QueryResult<any[]>> {
    const { client } = await this.getClient();
    const { data, error } = await client.storage.from(this.bucket).remove(paths);
    if (error) return { data: null, error: normalizeError(error) };
    return { data: data ?? [], error: null };
  }

  getPublicUrl(path: string): { data: { publicUrl: string } } {
    const base = this.resolvedBaseUrl ?? '';
    return {
      data: {
        publicUrl: base
          ? `${base}/storage/v1/object/public/${this.bucket}/${path}`
          : path,
      },
    };
  }
}

class DirectStorage {
  from(bucket: string): DirectStorageBucket {
    return new DirectStorageBucket(bucket);
  }
}

const CHANNEL_DOMAINS: Record<string, string> = {
  'profile-changes': 'profiles',
  'other-names-changes': 'other_names',
  'friends-changes': 'friends',
  'followers-changes': 'followers',
  'notifications-changes': 'notifications',
  'comments_realtime': 'comments',
  'stories-changes': 'stories',
  'highlights-changes': 'story_highlights',
  'mentions-changes': 'mentions',
  'followed-hashtags-posts': 'posts',
};

function channelDomain(name: string): string {
  if (CHANNEL_DOMAINS[name]) return CHANNEL_DOMAINS[name];
  const prefix = name.split('-')[0];
  if (prefix === 'user' && name.includes('stories')) return 'stories';
  if (prefix === 'message') return 'messages';
  if (prefix === 'reactions') return 'reactions';
  if (prefix === 'story') return 'stories';
  if (prefix === 'poll') return 'message_polls';
  if (prefix === 'other') return 'conversation_settings';
  throw new Error(`No registered realtime domain for channel: ${name}`);
}

// Realtime payload shapes differ per channel; callers own the narrow types.
type RealtimePayloadCallback = (payload: any) => void;

type ChannelListener = {
  type: string;
  filter: Record<string, unknown> | string;
  callback: RealtimePayloadCallback;
};

export class DirectChannel {
  private listeners: ChannelListener[] = [];
  private broadcasts: Array<{ event: string; callback: RealtimePayloadCallback }> = [];
  private realChannel: any = null;
  private subscribeCallback: ((status: string) => void) | null = null;
  private readonly ready: Promise<void>;

  constructor(private readonly name: string, private readonly config: Record<string, unknown> = {}) {
    // Callers may send or subscribe immediately after construction; buffer those
    // calls until the routed Supabase client has been resolved.
    this.ready = this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      const domain = typeof this.config.domain === 'string' ? this.config.domain : channelDomain(this.name);
      const { client } = await getProjectClient({ domain, operation: 'read' });
      this.realChannel = client.channel(this.name, this.config as never);

      for (const listener of this.listeners) {
        this.realChannel.on(listener.type, listener.filter as any, listener.callback);
      }
      for (const listener of this.broadcasts) {
        this.realChannel.on('broadcast', { event: listener.event }, listener.callback);
      }

      this.realChannel.subscribe((status: string) => {
        this.subscribeCallback?.(status);
      });
    } catch (error) {
      console.warn('[dataClient] realtime channel unavailable', this.name, normalizeError(error)?.message);
      this.subscribeCallback?.('CHANNEL_ERROR');
    }
  }

  on(type: string, filter: Record<string, unknown> | string, callback: RealtimePayloadCallback): this {
    if (type === 'broadcast') {
      const event = typeof filter === 'string' ? filter : (filter as Record<string, unknown>).event as string;
      if (event) {
        this.broadcasts.push({ event, callback });
        if (this.realChannel) this.realChannel.on('broadcast', { event }, callback);
      }
      return this;
    }
    this.listeners.push({ type, filter, callback });
    if (this.realChannel) this.realChannel.on(type, filter as any, callback);
    return this;
  }

  subscribe(callback?: (status: string) => void): this {
    this.subscribeCallback = callback ?? null;
    if (this.realChannel) {
      this.realChannel.subscribe((status: string) => callback?.(status));
    }
    return this;
  }

  unsubscribe(): void {
    if (this.realChannel) void this.realChannel.unsubscribe();
    this.listeners = [];
    this.broadcasts = [];
  }

  async send(options: { type: string; event: string; payload: unknown }): Promise<boolean> {
    await this.ready;
    if (!this.realChannel) return false;
    const result = await this.realChannel.send(options);
    return result !== 'error';
  }
}

const openChannels = new Set<DirectChannel>();

class DirectAuth {
  onAuthStateChange(callback: (event: string, session: any) => void) {
    return centralAuth.onAuthStateChange(callback);
  }
  getSession() { return centralAuth.getSession(); }
  getUser() { return centralAuth.getUser(); }
  signInWithPassword(credentials: { email: string; password: string }) {
    return centralAuth.signInWithPassword(credentials);
  }
  signUp(options: { email: string; password: string; options?: Record<string, unknown> }) {
    return centralAuth.signUp(options);
  }
  signOut() { return centralAuth.signOut(); }
  updateUser(options: UpdateUserOptions) {
    return centralAuth.updateUser(options);
  }
  refreshSession() { return centralAuth.refreshSession(); }
  get mfa() { return centralAuth.mfa; }
}

class DirectClient {
  readonly auth = new DirectAuth();
  readonly storage = new DirectStorage();
  readonly functions = {
    // Compatibility boundary: most callers still consume the untyped payload.
    invoke: <T = any>(name: string, options?: { body?: unknown }): Promise<QueryResult<T>> =>
      callEdgeFunction<unknown, T>(name, options?.body ?? {}) as Promise<QueryResult<T>>,
  };

  from<T = any>(table: string): DirectQueryBuilder<T> {
    return new DirectQueryBuilder<T>(table, 'select');
  }

  // Compatibility boundary: RPC payload shapes are owned by each caller.
  async rpc<T = any>(functionName: string, params?: Record<string, unknown>): Promise<QueryResult<T>> {
    try {
      const route = await resolveRpcRoute(functionName, 'write');
      const client = await getClientForRoute(route);
      const { data, error } = await client.rpc(functionName, params ?? {});
      if (error) return { data: null, error: normalizeError(error) };
      return { data: data as T, error: null };
    } catch (error) {
      return { data: null, error: normalizeError(error) };
    }
  }

  channel(name: string, config?: Record<string, unknown>): DirectChannel {
    const channel = new DirectChannel(name, config);
    openChannels.add(channel);
    return channel;
  }

  removeChannel(channel: DirectChannel): void {
    channel.unsubscribe();
    openChannels.delete(channel);
  }

  removeAllChannels(): void {
    for (const channel of openChannels) channel.unsubscribe();
    openChannels.clear();
  }

  presenceHeartbeat() {
    return callEdgeFunction<{ action: string }, any>('presence', { action: 'heartbeat' });
  }

  presenceLogout() {
    return callEdgeFunction<{ action: string }, any>('presence', { action: 'logout' });
  }

  presenceOnlineFriends() {
    return callEdgeFunction<{ action: string }, any>('presence', { action: 'online-friends' });
  }

  relationshipCounts(profileId: string) {
    return callEdgeFunction<{ profileId: string }, any>('profileStats', { profileId });
  }

  postReactionUsers(postId: string, options: ReactionUsersOptions = {}): Promise<ReactionUsersResult> {
    return callEdgeFunction<Record<string, unknown>, ReactionUsersPage>('reactionSummary', {
      kind: 'postUsers',
      contentId: postId,
      ...options,
    });
  }

  commentReactionUsers(commentId: string, options: ReactionUsersOptions = {}): Promise<ReactionUsersResult> {
    return callEdgeFunction<Record<string, unknown>, ReactionUsersPage>('reactionSummary', {
      kind: 'commentUsers',
      contentId: commentId,
      ...options,
    });
  }

  commentReactionCounts(commentIds: string[]): Promise<CommentReactionCountsResult> {
    return callEdgeFunction<Record<string, unknown>, { counts: Record<string, CommentReactionCountSummary> }>(
      'reactionSummary',
      { kind: 'commentCounts', ids: [...new Set(commentIds)].slice(0, 100) }
    );
  }

  postReactionCount(postId: string) {
    return callEdgeFunction<Record<string, unknown>, any>('reactionSummary', {
      kind: 'postCount',
      contentId: postId,
    });
  }
}

export const dataClient = new DirectClient();

export { clearClientCache };
export type { DirectChannel as GatewayChannel };
