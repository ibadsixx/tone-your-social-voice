// Tone frontend — direct Supabase data client.
//
// This is the only application data client. Tables and RPCs are routed through
// the registry resolver to one active project, and every request carries the
// central Auth JWT so project RLS policies authorize it. Cross-project work is
// delegated to narrowly scoped Edge Functions, never to the abandoned Gateway.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  clearClientCache as clearFactoryClientCache,
  getClientForRoute,
  getProjectClient,
} from './clientFactory';
import { resolveRpcRoute, resolveTableRoute } from './routing';
import { KNOWN_PROJECT_REFS, REGISTRY_PROJECT_KEYS } from './projects';
import { callEdgeFunction } from './crossProject';
import * as centralAuth from './centralAuth';
import type { OperationType, ProjectRouteRequest } from './types';
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

// Phase 3G-N: nested embeds are passed through to PostgREST untouched. The old
// client-side join resolver re-read related tables with `select('*')` and then
// deleted columns in JavaScript, which fetched private profile rows over the
// network. PostgREST owns relationship resolution; every embedded profile
// projection must be explicit at its call site.

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
      // Preserve the caller's select exactly, including embedded relations and
      // their aliases. Narrowing is done by the caller, never by trimming rows
      // after a full-table fetch.
      const primarySelect = this.selectColumns;

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

      return { data: data as T, error: null };
    } catch (error) {
      return { data: null, error: normalizeError(error) };
    }
  }
}

// Phase 3B verified these bucket names and their public/private status on the
// central Auth host. Buckets that were not found live are deliberately absent:
// `from()` them still fails closed rather than inventing a project or bucket.
type BucketPrivacy = 'public' | 'private';

interface VerifiedBucketRoute {
  domain: string;
  projectKey: string;
  expectedProjectRef: string;
  privacy: BucketPrivacy;
}

const VERIFIED_BUCKET_ROUTE: Omit<VerifiedBucketRoute, 'privacy'> = {
  domain: 'users',
  projectKey: REGISTRY_PROJECT_KEYS.users,
  expectedProjectRef: KNOWN_PROJECT_REFS.centralAuth,
};

const VERIFIED_BUCKETS: Readonly<Record<string, BucketPrivacy>> = Object.freeze({
  editor_videos: 'public',
  chat_media: 'public',
  group_covers: 'public',
  stories: 'public',
  avatars: 'public',
  covers: 'public',
  stickers: 'public',
  message_audios: 'private',
  'report-evidence': 'private',
});

function storageBucketRoute(bucket: string): VerifiedBucketRoute {
  const privacy = VERIFIED_BUCKETS[bucket];
  if (!privacy) {
    throw new Error(
      `No verified Storage owner for bucket "${bucket}". Phase 3B did not confirm this bucket on a registered host; routing refused.`
    );
  }
  return { ...VERIFIED_BUCKET_ROUTE, privacy };
}

function storageRouteRequest(bucket: string, operation: OperationType): ProjectRouteRequest {
  const route = storageBucketRoute(bucket);
  return {
    domain: route.domain,
    operation,
    projectKey: route.projectKey,
    expectedProjectRef: route.expectedProjectRef,
  };
}

export interface SignedUrlData {
  signedUrl: string;
  expiresAt: string;
  expiresIn: number;
}

const DEFAULT_SIGNED_URL_TTL_SECONDS = 10 * 60;
const MIN_SIGNED_URL_TTL_SECONDS = 60;
const MAX_SIGNED_URL_TTL_SECONDS = 60 * 60;
const SIGNED_URL_REFRESH_SKEW_MS = 30 * 1000;

function normalizeSignedUrlTtl(expiresIn: number | undefined): number {
  const ttl = expiresIn ?? DEFAULT_SIGNED_URL_TTL_SECONDS;
  if (!Number.isInteger(ttl) || ttl < MIN_SIGNED_URL_TTL_SECONDS || ttl > MAX_SIGNED_URL_TTL_SECONDS) {
    throw new Error(
      `Signed URL expiry must be an integer between ${MIN_SIGNED_URL_TTL_SECONDS} and ${MAX_SIGNED_URL_TTL_SECONDS} seconds`
    );
  }
  return ttl;
}

function signedUrlIsFresh(cached: SignedUrlData, now = Date.now()): boolean {
  if (!cached.signedUrl.includes('/object/sign/')) return false;
  const expiresAt = Date.parse(cached.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt - SIGNED_URL_REFRESH_SKEW_MS > now;
}

// Cache bucket clients and resolved base URLs so a `.upload()` followed by a
// `.getPublicUrl()` — the dominant app pattern — always uses the same project.
// A bucket that has never been resolved fails closed instead of emitting a bare
// path that no browser can load.
const storageBuckets = new Map<string, DirectStorageBucket>();
const storageBaseUrls = new Map<string, string>();

function clearStorageCache(): void {
  storageBuckets.clear();
  storageBaseUrls.clear();
}

class DirectStorageBucket {
  private readonly clientPromises = new Map<OperationType, Promise<{ client: SupabaseClient; baseUrl: string }>>();
  private resolvedBaseUrl: string | null = null;

  constructor(private readonly bucket: string) {}

  private getClient(operation: OperationType): Promise<{ client: SupabaseClient; baseUrl: string }> {
    let promise = this.clientPromises.get(operation);
    if (!promise) {
      promise = getProjectClient(storageRouteRequest(this.bucket, operation)).then(
        ({ route, client }) => {
          const baseUrl = route.project.project_url.replace(/\/$/, '');
          this.resolvedBaseUrl = baseUrl;
          storageBaseUrls.set(this.bucket, baseUrl);
          return { client, baseUrl };
        }
      );
      this.clientPromises.set(operation, promise);
    }
    return promise;
  }

  async upload(
    path: string,
    file: File | Blob,
    options?: { contentType?: string; upsert?: boolean; cacheControl?: string }
  ): Promise<QueryResult<{ path: string; url?: string }>> {
    const { client } = await this.getClient('write');
    const { data, error } = await client.storage
      .from(this.bucket)
      .upload(path, file, {
        contentType: options?.contentType,
        upsert: options?.upsert ?? false,
        cacheControl: options?.cacheControl ?? '3600',
      });
    if (error) return { data: null, error: normalizeError(error) };
    // Never hand a public URL back for a private bucket; callers must sign it.
    return { data: { path: data?.path ?? path, url: undefined }, error: null };
  }

  async list(path?: string, options?: { limit?: number; offset?: number; sortBy?: { column: string; order: string } }): Promise<QueryResult<any[]>> {
    const { client } = await this.getClient('write');
    const { data, error } = await client.storage.from(this.bucket).list(path, options);
    if (error) return { data: null, error: normalizeError(error) };
    return { data: data ?? [], error: null };
  }

  async remove(paths: string[]): Promise<QueryResult<any[]>> {
    const { client } = await this.getClient('write');
    const { data, error } = await client.storage.from(this.bucket).remove(paths);
    if (error) return { data: null, error: normalizeError(error) };
    return { data: data ?? [], error: null };
  }

  private objectPath(path: string): string {
    // Some persisted paths already include the bucket name. Do not emit a
    // doubled /message_audios/message_audios/... segment.
    return path.startsWith(`${this.bucket}/`) ? path : `${this.bucket}/${path}`;
  }

  private publicUrl(base: string, path: string): string {
    return `${base}/storage/v1/object/public/${this.objectPath(path)}`;
  }

  private assertPublicBucket(): void {
    const route = storageBucketRoute(this.bucket);
    if (route.privacy === 'private') {
      throw new Error(
        `Storage bucket ${this.bucket} is private. Use getSignedUrlAsync() with the authenticated session; public URLs are refused.`
      );
    }
  }

  getPublicUrl(path: string): { data: { publicUrl: string } } {
    this.assertPublicBucket();
    const base = this.resolvedBaseUrl ?? storageBaseUrls.get(this.bucket);
    if (!base) {
      // Returning the bare path silently sent browsers to a relative URL that
      // never resolved. Fail loudly until this bucket has been routed once.
      throw new Error(
        `Storage bucket ${this.bucket} has not been routed yet; resolve it with upload/list/remove before building a public URL`
      );
    }
    return { data: { publicUrl: this.publicUrl(base, path) } };
  }

  /**
   * Resolve a public URL for a path loaded from the database or props, where no
   * upload/list/remove has routed this bucket during the session. Routing is
   * registry-driven and fail-closed, using the same verified bucket host as
   * upload/list/remove; the cached URL from an earlier routed operation is
   * reused when available. Private buckets never use this path.
   */
  async getPublicUrlAsync(path: string): Promise<{ data: { publicUrl: string } }> {
    this.assertPublicBucket();
    let base = this.resolvedBaseUrl ?? storageBaseUrls.get(this.bucket);
    if (!base) {
      ({ baseUrl: base } = await this.getClient('read'));
    }
    return { data: { publicUrl: this.publicUrl(base, path) } };
  }

  /**
   * Create (or refresh) a signed URL for a private bucket using the routed
   * client's authenticated session. Storage RLS decides whether the signed URL
   * is issued; missing objects and authorization failures are returned as
   * errors and never fall back to a public URL.
   */
  async createSignedUrlAsync(
    path: string,
    options: { expiresIn?: number; cached?: SignedUrlData } = {}
  ): Promise<{ data: SignedUrlData | null; error: QueryErrorInfo | null }> {
    try {
      const route = storageBucketRoute(this.bucket);
      if (route.privacy !== 'private') {
        throw new Error(
          `Storage bucket ${this.bucket} is public; use getPublicUrl()/getPublicUrlAsync() instead of a signed URL`
        );
      }
      const expiresIn = normalizeSignedUrlTtl(options.expiresIn);
      if (options.cached && signedUrlIsFresh(options.cached)) {
        return { data: options.cached, error: null };
      }

      const { client } = await this.getClient('read');
      const { data, error } = await client.storage
        .from(this.bucket)
        .createSignedUrl(this.objectPath(path), expiresIn);
      if (error) {
        const normalized = normalizeError(error) ?? { message: 'Signed URL request failed' };
        return {
          data: null,
          error: {
            ...normalized,
            message: `Signed URL unavailable for private bucket ${this.bucket}: ${normalized.message}`,
          },
        };
      }
      if (!data?.signedUrl) {
        return {
          data: null,
          error: { message: `Storage returned no signed URL for private bucket ${this.bucket}` },
        };
      }
      return {
        data: {
          signedUrl: data.signedUrl,
          expiresIn,
          expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
        },
        error: null,
      };
    } catch (error) {
      return { data: null, error: normalizeError(error) };
    }
  }
}

class DirectStorage {
  from(bucket: string): DirectStorageBucket {
    let bucketClient = storageBuckets.get(bucket);
    if (!bucketClient) {
      bucketClient = new DirectStorageBucket(bucket);
      storageBuckets.set(bucket, bucketClient);
    }
    return bucketClient;
  }
}

interface VerifiedChannelRoute {
  domain: string;
  projectKey?: string;
  expectedProjectRef?: string;
}

// Exact channels only. Phase 3B did not justify any broad prefix mapping.
const VERIFIED_CHANNEL_ROUTES: Readonly<Record<string, VerifiedChannelRoute>> = Object.freeze({
  // Confirmed Registry row and approved identity; publication is still unverified.
  'profile-changes': {
    domain: 'profiles',
    projectKey: REGISTRY_PROJECT_KEYS.profiles,
    expectedProjectRef: KNOWN_PROJECT_REFS.profiles,
  },
  // The real trigger table is on hashtags-1-3, not posts-1. No project key is
  // asserted because the Realtime publication itself was not verified.
  'followed-hashtags-posts': { domain: 'hashtag_links' },
  'other-names-changes': { domain: 'other_names' },
  'friends-changes': { domain: 'friends' },
  'followers-changes': { domain: 'followers' },
  'notifications-changes': { domain: 'notifications' },
  'comments_realtime': { domain: 'comments' },
  'stories-changes': { domain: 'stories' },
  'highlights-changes': { domain: 'story_highlights' },
  'mentions-changes': { domain: 'mentions' },
  'message-requests-changes': { domain: 'message_requests' },
});

const VERIFIED_CHANNEL_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  route: VerifiedChannelRoute;
}> = Object.freeze([
  { pattern: /^user-stories-[^/]+$/, route: { domain: 'stories' } },
  { pattern: /^story-reactions-[^/]+$/, route: { domain: 'story_reactions' } },
  { pattern: /^message-reactions-[^/]+$/, route: { domain: 'message_reactions' } },
  { pattern: /^poll-votes-[^/]+$/, route: { domain: 'message_poll_votes' } },
  { pattern: /^other-read-receipts-[^/]+$/, route: { domain: 'conversation_settings' } },
  { pattern: /^reactions-[^/]+$/, route: { domain: 'reactions' } },
]);

function channelRoute(name: string): VerifiedChannelRoute {
  const exact = VERIFIED_CHANNEL_ROUTES[name];
  if (exact) return exact;
  const matched = VERIFIED_CHANNEL_PATTERNS.find((entry) => entry.pattern.test(name));
  if (matched) return matched.route;
  throw new Error(
    `No verified Realtime route for channel "${name}"; ownership/publication is not proven, so the subscription is refused`
  );
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
  private subscribeCallback: ((status: string, error?: QueryErrorInfo | null) => void) | null = null;
  private failure: QueryErrorInfo | null = null;
  private readonly ready: Promise<void>;

  constructor(private readonly name: string, private readonly config: Record<string, unknown> = {}) {
    // Callers may send or subscribe immediately after construction; buffer those
    // calls until the routed Supabase client has been resolved.
    this.ready = this.initialize();
  }

  get lastError(): QueryErrorInfo | null {
    return this.failure;
  }

  private async initialize(): Promise<void> {
    try {
      const route: VerifiedChannelRoute =
        typeof this.config.domain === 'string'
          ? { domain: this.config.domain }
          : channelRoute(this.name);
      const request: ProjectRouteRequest = { domain: route.domain, operation: 'read' };
      if (route.projectKey) request.projectKey = route.projectKey;
      if (route.expectedProjectRef) request.expectedProjectRef = route.expectedProjectRef;

      const { client } = await getProjectClient(request);
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
      this.failure = normalizeError(error);
      console.warn(
        '[dataClient] realtime channel unavailable',
        this.name,
        this.failure?.message
      );
      this.subscribeCallback?.('CHANNEL_ERROR', this.failure);
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

  subscribe(callback?: (status: string, error?: QueryErrorInfo | null) => void): this {
    this.subscribeCallback = callback ?? null;
    if (this.realChannel) {
      this.realChannel.subscribe((status: string) => callback?.(status));
    } else if (callback && this.failure) {
      // A failed route must not look like a silent disconnected channel.
      callback('CHANNEL_ERROR', this.failure);
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
      const route = await resolveRpcRoute(functionName);
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

/** Clear routed Supabase clients and their cached Storage project URLs. */
export function clearClientCache(): void {
  clearFactoryClientCache();
  clearStorageCache();
}

export type { DirectChannel as GatewayChannel };
