import {
  ChaosContractError,
  fieldTypesForKind,
  isChaosItemId,
  parseChaosItem,
  presentChaosError,
  validateChaosDraftRequest,
  type ChaosConnectionStatus,
  type ChaosConnectionTest,
  type ChaosCreateOutcome,
  type ChaosDefinition,
  type ChaosDraftRequest,
  type ChaosDraftUpdateRequest,
  type ChaosError,
  type ChaosErrorCode,
  type ChaosItem,
  type ChaosItemKind,
  type ChaosItemPage,
  type ChaosLinkView,
  type ChaosLocalDefinition,
  type ChaosPendingOperation,
  type ChaosRefreshResult,
  type ChaosResult,
  type ChaosScope,
  type ChaosTemplateCopy,
} from '../../../shared/chaos-integration-contract';
import { buildDraftRequest, definitionToLocal } from '../../../shared/chaos-field-mapping';
import type {
  ChaosConnectionRecord,
  ChaosLinkRecord,
  ChaosLinkRepository,
  ChaosOperationRecord,
} from '../../database/chaos-link-repository';
import { ChaosApiError, ChaosClient, assertChaosToken, normalizeChaosOrigin } from './chaos-client';
import { SecureStorageUnavailableError, type ChaosTokenStore } from './chaos-token-store';

export type ChaosServiceOptions = Readonly<{
  fetchImpl?: typeof fetch;
  now?: () => Date;
  /** Minimum time between automatic refreshes of the same link. */
  refreshIntervalMs?: number;
  repository: ChaosLinkRepository;
  timeoutMs?: number;
  tokens: ChaosTokenStore;
}>;

/**
 * Codes after which a create or update may have reached Chaos, or may succeed
 * if sent again unchanged. Their pending operation is kept, with its key, so a
 * retry can never make a second draft. Every other failure means Chaos refused
 * the request outright, and the operation is closed.
 */
const KEEP_OPERATION: ReadonlySet<ChaosErrorCode> = new Set([
  'NETWORK', 'TIMEOUT', 'SERVER_ERROR', 'RATE_LIMITED', 'INVALID_RESPONSE', 'UNAUTHORIZED', 'TOKEN_REVOKED', 'NOT_CONNECTED', 'UNKNOWN',
]);

function problemsFrom(details: unknown): string[] | undefined {
  const list = Array.isArray(details) ? details
    : typeof details === 'object' && details !== null && Array.isArray((details as { problems?: unknown }).problems) ? (details as { problems: unknown[] }).problems
      : typeof details === 'object' && details !== null && Array.isArray((details as { errors?: unknown }).errors) ? (details as { errors: unknown[] }).errors
        : undefined;
  if (!list) return undefined;
  return list.slice(0, 50).map((entry) => {
    if (typeof entry === 'string') return entry.slice(0, 300);
    if (typeof entry === 'object' && entry !== null) {
      const { message, path } = entry as { message?: unknown; path?: unknown };
      const where = typeof path === 'string' ? path : Array.isArray(path) ? path.join('.') : '';
      if (typeof message === 'string') return `${where ? `${where}: ` : ''}${message}`.slice(0, 300);
    }
    return 'Chaos reported a problem with the draft.';
  });
}

function toError(error: unknown, extra: Partial<ChaosError> = {}): ChaosError {
  if (error instanceof ChaosApiError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.retryAfterSeconds !== undefined ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
      ...(error.problems ? { problems: error.problems } : error.code === 'VALIDATION_FAILED' ? { problems: problemsFrom(error.details) } : {}),
      ...extra,
    };
  }
  if (error instanceof SecureStorageUnavailableError) return { code: 'SECURE_STORAGE_UNAVAILABLE', message: error.message, ...extra };
  if (error instanceof ChaosContractError) return { code: error.code === 'UNSUPPORTED_VERSION' ? 'UNSUPPORTED_VERSION' : 'INVALID_INPUT', message: error.message, ...extra };
  return { code: 'UNKNOWN', message: 'Something went wrong while talking to Chaos. Your Max workspace was not changed.', ...extra };
}

function fail<T>(code: ChaosErrorCode, message: string, extra: Partial<ChaosError> = {}): ChaosResult<T> {
  return { error: { code, message, ...extra }, ok: false };
}

function stripKind(request: ChaosDraftRequest): ChaosDraftUpdateRequest {
  const { kind, ...rest } = request;
  void kind;
  return rest;
}

type ActiveConnection = Readonly<{ client: ChaosClient; connection: ChaosConnectionRecord }>;

/**
 * Everything Max does with Chaos, in the main process.
 *
 * The token is read from the OS-encrypted store only to build a client, and no
 * method returns it. Every network result passes through the shared contract
 * validators before it is stored or returned. Nothing here blocks local work:
 * failures come back as results, and cached data stays readable offline.
 */
export class ChaosService {
  readonly #repository: ChaosLinkRepository;
  readonly #tokens: ChaosTokenStore;
  readonly #fetch?: typeof fetch;
  readonly #timeoutMs?: number;
  readonly #now: () => Date;
  readonly #refreshIntervalMs: number;
  readonly #inFlightOperations = new Map<string, Promise<ChaosResult<ChaosCreateOutcome>>>();
  readonly #inFlightRefresh = new Map<string, Promise<ChaosResult<ChaosRefreshResult>>>();

  constructor({ fetchImpl, now = () => new Date(), refreshIntervalMs = 60_000, repository, timeoutMs, tokens }: ChaosServiceOptions) {
    this.#repository = repository;
    this.#tokens = tokens;
    this.#fetch = fetchImpl;
    this.#timeoutMs = timeoutMs;
    this.#now = now;
    this.#refreshIntervalMs = refreshIntervalMs;
  }

  #timestamp(): string {
    return this.#now().toISOString();
  }

  #client(apiOrigin: string, token: string): ChaosClient {
    return new ChaosClient({ apiOrigin, fetchImpl: this.#fetch, timeoutMs: this.#timeoutMs, token });
  }

  async #active(): Promise<ActiveConnection> {
    const connection = this.#repository.currentConnection();
    if (!connection || connection.state !== 'connected') throw new ChaosApiError('NOT_CONNECTED', 'Max is not connected to Chaos. Connect in Settings → Connections.');
    const token = await this.#tokens.get(connection.id);
    if (!token) throw new ChaosApiError('NOT_CONNECTED', 'This computer has no Chaos token for the connection. Connect again in Settings → Connections.');
    return { client: this.#client(connection.apiOrigin, token), connection };
  }

  #requireScope(connection: ChaosConnectionRecord, scope: ChaosScope): void {
    if (!connection.scopes.includes(scope)) {
      throw new ChaosApiError('INSUFFICIENT_SCOPE', `This Chaos connection was not granted “${scope}”. Create a token with that permission in Chaos.`);
    }
  }

  async #guard<T>(work: () => T | Promise<T>): Promise<ChaosResult<T>> {
    try {
      return { ok: true, value: await work() };
    } catch (error) {
      return { error: toError(error), ok: false };
    }
  }

  // Connection -----------------------------------------------------------------

  async getStatus(): Promise<ChaosConnectionStatus> {
    const secureStorageAvailable = this.#tokens.isAvailable();
    await this.#tokens.prune(new Set(this.#repository.listConnectionIds())).catch(() => undefined);
    const connection = this.#repository.currentConnection();
    if (!connection) {
      return {
        access: null, apiOrigin: null, connectionLabel: null, fieldTypes: null, lastCheckedAt: null, limits: null,
        scopes: [], secureStorageAvailable, state: 'none', workspaceName: null,
      };
    }
    const hasToken = connection.state === 'connected' && await this.#tokens.has(connection.id);
    return {
      access: connection.access,
      apiOrigin: connection.apiOrigin,
      connectionLabel: connection.connectionLabel,
      fieldTypes: connection.capabilities.fieldTypes,
      lastCheckedAt: connection.lastCheckedAt,
      limits: connection.capabilities.limits,
      scopes: connection.scopes,
      secureStorageAvailable,
      state: connection.state === 'disconnected' ? 'disconnected' : hasToken ? 'connected' : 'needs-token',
      workspaceName: connection.workspaceName,
    };
  }

  testConnection(apiOrigin: string, token: string): Promise<ChaosResult<ChaosConnectionTest>> {
    return this.#guard(async () => {
      const origin = normalizeChaosOrigin(apiOrigin);
      const capabilities = await this.#client(origin, assertChaosToken(token)).getCapabilities();
      return {
        access: capabilities.connection.access,
        apiOrigin: origin,
        connectionLabel: capabilities.connection.label,
        expiresAt: capabilities.connection.expiresAt,
        scopes: capabilities.scopes,
        supportedKinds: capabilities.supportedKinds,
        workspaceName: capabilities.workspace.name,
      };
    });
  }

  /** Test again, then keep the token encrypted and the connection's public details in the workspace. */
  saveConnection(apiOrigin: string, token: string): Promise<ChaosResult<ChaosConnectionStatus>> {
    return this.#guard(async () => {
      if (!this.#tokens.isAvailable()) throw new SecureStorageUnavailableError();
      const origin = normalizeChaosOrigin(apiOrigin);
      const checked = assertChaosToken(token);
      const capabilities = await this.#client(origin, checked).getCapabilities();
      const connection = this.#repository.saveConnection(origin, capabilities, this.#timestamp());
      try {
        await this.#tokens.set(connection.id, checked);
      } catch (error) {
        this.#repository.setConnectionState(connection.id, 'disconnected', this.#timestamp());
        throw error;
      }
      return this.getStatus();
    });
  }

  /** Forget the token on this computer. Links stay, shown as disconnected. Nothing in Chaos changes. */
  disconnect(): Promise<ChaosResult<ChaosConnectionStatus>> {
    return this.#guard(async () => {
      const connection = this.#repository.currentConnection();
      if (connection) {
        await this.#tokens.delete(connection.id);
        this.#repository.setConnectionState(connection.id, 'disconnected', this.#timestamp());
      }
      return this.getStatus();
    });
  }

  // Items -----------------------------------------------------------------------

  listItems(kind?: ChaosItemKind, cursor?: string): Promise<ChaosResult<ChaosItemPage>> {
    return this.#guard(async () => {
      const { client, connection } = await this.#active();
      this.#requireScope(connection, 'items:read');
      return client.listItems(kind, cursor);
    });
  }

  // Links -------------------------------------------------------------------------

  async #connectedIds(): Promise<ReadonlySet<string>> {
    const connection = this.#repository.currentConnection();
    return connection?.state === 'connected' && await this.#tokens.has(connection.id) ? new Set([connection.id]) : new Set();
  }

  #view(link: ChaosLinkRecord, connected: ReadonlySet<string>): ChaosLinkView {
    const isConnected = connected.has(link.connectionId);
    return {
      connected: isConnected,
      createdAt: link.createdAt,
      id: link.id,
      item: link.item,
      itemFetchedAt: link.itemFetchedAt,
      itemId: link.itemId,
      kind: link.kind,
      lastErrorCode: link.lastErrorCode,
      localChanges: link.localChanges,
      localDefinition: link.localDefinition,
      pageId: link.pageId,
      state: isConnected ? link.lastState : 'disconnected',
      summary: link.summary,
      summaryFetchedAt: link.summaryFetchedAt,
      syncedDefinition: link.syncedDefinition,
      syncedRevision: link.syncedRevision,
    };
  }

  async #linkView(id: string): Promise<ChaosLinkView> {
    const link = this.#repository.getLink(id);
    if (!link) throw new ChaosApiError('INVALID_INPUT', 'That link no longer exists.');
    return this.#view(link, await this.#connectedIds());
  }

  /** Cached links for a page. Never touches the network, so it works offline. */
  listLinks(pageId: string): Promise<ChaosResult<readonly ChaosLinkView[]>> {
    return this.#guard(async () => {
      const connected = await this.#connectedIds();
      return this.#repository.listLinks(pageId).map((link) => this.#view(link, connected));
    });
  }

  /**
   * Refresh metadata and summaries for a page's links. Automatic refreshes
   * (`force` false) skip links checked within the refresh interval, and two
   * refreshes of the same page share one run.
   */
  refreshLinks(pageId: string, force = false): Promise<ChaosResult<ChaosRefreshResult>> {
    const key = `${pageId}:${force ? 'force' : 'auto'}`;
    const existing = this.#inFlightRefresh.get(key);
    if (existing) return existing;
    const run = this.#guard(() => this.#refresh(pageId, force)).finally(() => this.#inFlightRefresh.delete(key));
    this.#inFlightRefresh.set(key, run);
    return run;
  }

  async #refresh(pageId: string, force: boolean): Promise<ChaosRefreshResult> {
    const links = this.#repository.listLinks(pageId);
    let active: ActiveConnection | null = null;
    try { active = await this.#active(); } catch { active = null; }
    let refreshed = 0;
    let skipped = 0;
    let stop: ChaosErrorCode | null = null;
    for (const link of links) {
      if (!active || link.connectionId !== active.connection.id) { skipped += 1; continue; }
      const last = link.lastAttemptAt ? Date.parse(link.lastAttemptAt) : 0;
      if (!force && this.#now().getTime() - last < this.#refreshIntervalMs) { skipped += 1; continue; }
      if (stop) {
        this.#repository.updateLinkCache(link.id, { errorCode: stop, state: presentChaosError(stop).state }, this.#timestamp());
        skipped += 1;
        continue;
      }
      try {
        const item = await active.client.getItem(link.itemId);
        let summary = link.summary;
        let summaryFetchedAt: string | undefined;
        if (active.connection.scopes.includes('summaries:read')) {
          try {
            summary = await active.client.getSummary(link.itemId);
            summaryFetchedAt = this.#timestamp();
          } catch (error) {
            // A summary that cannot be read leaves the item fresh and the old summary in place.
            if (!(error instanceof ChaosApiError)) throw error;
          }
        }
        this.#repository.updateLinkCache(link.id, { item, itemFetchedAt: this.#timestamp(), state: 'ok', summary, summaryFetchedAt }, this.#timestamp());
        refreshed += 1;
      } catch (error) {
        const code = error instanceof ChaosApiError ? error.code : 'UNKNOWN';
        this.#repository.updateLinkCache(link.id, { errorCode: code, state: presentChaosError(code).state }, this.#timestamp());
        // Once the token is refused, or Chaos cannot be reached, asking again for every link only repeats the answer.
        if (['UNAUTHORIZED', 'TOKEN_REVOKED', 'NETWORK', 'TIMEOUT', 'RATE_LIMITED', 'UNSUPPORTED_VERSION'].includes(code)) stop = code;
      }
    }
    const connected = await this.#connectedIds();
    return { links: this.#repository.listLinks(pageId).map((link) => this.#view(link, connected)), refreshed, skipped };
  }

  linkExisting(pageId: string, itemId: string): Promise<ChaosResult<ChaosLinkView>> {
    return this.#guard(async () => {
      const id = itemId.trim();
      if (!isChaosItemId(id)) throw new ChaosApiError('INVALID_INPUT', 'Chaos item ids start with form_ or quiz_.');
      if (!this.#repository.pageExists(pageId)) throw new ChaosApiError('INVALID_INPUT', 'This page no longer exists.');
      const { client, connection } = await this.#active();
      this.#requireScope(connection, 'items:read');
      const item = await client.getItem(id);
      const link = this.#repository.insertLink({ connectionId: connection.id, item, pageId }, this.#timestamp());
      if (connection.scopes.includes('summaries:read')) {
        try {
          const summary = await client.getSummary(id);
          this.#repository.updateLinkCache(link.id, { state: 'ok', summary, summaryFetchedAt: this.#timestamp() }, this.#timestamp());
        } catch { /* the card shows no summary until the next refresh */ }
      }
      return this.#linkView(link.id);
    });
  }

  /** Remove the local link only. The Chaos item and its responses are not touched. */
  unlink(linkId: string): Promise<ChaosResult<null>> {
    return this.#guard(() => {
      this.#repository.deleteLink(linkId);
      return null;
    });
  }

  // Creating and updating drafts ------------------------------------------------------

  createDraft(pageId: string, request: ChaosDraftRequest): Promise<ChaosResult<ChaosCreateOutcome>> {
    return this.#guard(async () => {
      if (!this.#repository.pageExists(pageId)) throw new ChaosApiError('INVALID_INPUT', 'This page no longer exists.');
      const { connection } = await this.#active();
      this.#requireScope(connection, 'drafts:create');
      const normalized = buildDraftRequest(request.kind, request, request.source?.label);
      const allowed = connection.capabilities.fieldTypes[request.kind]?.length ? connection.capabilities.fieldTypes[request.kind] : fieldTypesForKind(request.kind);
      const problems = validateChaosDraftRequest(normalized, allowed);
      if (problems.length) throw new ChaosApiError('INVALID_INPUT', 'The draft cannot be sent yet.', undefined, undefined, undefined, problems);
      // Persisted before anything is sent, so the key survives a crash mid-request.
      const operation = this.#repository.insertOperation({ connectionId: connection.id, operation: 'create_draft', pageId, request: normalized }, this.#timestamp());
      return operation;
    }).then((created) => created.ok ? this.#runOperation(created.value.id) : created);
  }

  saveLocalDefinition(linkId: string, definition: ChaosLocalDefinition): Promise<ChaosResult<ChaosLinkView>> {
    return this.#guard(async () => {
      const link = this.#repository.getLink(linkId);
      if (!link) throw new ChaosApiError('INVALID_INPUT', 'That link no longer exists.');
      const normalized = stripKind(buildDraftRequest(link.kind, definition));
      this.#repository.saveLocalDefinition(linkId, normalized, this.#timestamp());
      return this.#linkView(linkId);
    });
  }

  adoptChaosDefinition(linkId: string): Promise<ChaosResult<ChaosLinkView>> {
    return this.#guard(async () => {
      const link = this.#repository.getLink(linkId);
      if (!link) throw new ChaosApiError('INVALID_INPUT', 'That link no longer exists.');
      const { client, connection } = await this.#active();
      if (link.connectionId !== connection.id) throw new ChaosApiError('NOT_CONNECTED', 'This link belongs to a Chaos connection that is not active.');
      this.#requireScope(connection, 'definitions:read');
      const item = await client.getItem(link.itemId);
      const parsed = await client.getDefinition(link.itemId);
      const local = definitionToLocal(parsed.definition, parsed.unsupportedFields, false).definition;
      this.#repository.transaction(() => {
        this.#repository.updateLinkCache(link.id, { item, itemFetchedAt: this.#timestamp(), state: 'ok' }, this.#timestamp());
        this.#repository.markSynced(link.id, local, item.revision, this.#timestamp());
      });
      return this.#linkView(link.id);
    });
  }

  updateDraft(linkId: string, definition: ChaosLocalDefinition, expectedRevision?: string): Promise<ChaosResult<ChaosCreateOutcome>> {
    return this.#guard(async () => {
      const link = this.#repository.getLink(linkId);
      if (!link) throw new ChaosApiError('INVALID_INPUT', 'That link no longer exists.');
      const { connection } = await this.#active();
      if (link.connectionId !== connection.id) throw new ChaosApiError('NOT_CONNECTED', 'This link belongs to a Chaos connection that is not active.');
      this.#requireScope(connection, 'drafts:update');
      const full = buildDraftRequest(link.kind, definition);
      const allowed = connection.capabilities.fieldTypes[link.kind]?.length ? connection.capabilities.fieldTypes[link.kind] : fieldTypesForKind(link.kind);
      const problems = validateChaosDraftRequest(full, allowed);
      if (problems.length) throw new ChaosApiError('INVALID_INPUT', 'The draft cannot be sent yet.', undefined, undefined, undefined, problems);
      const body = stripKind(full);
      // Keep the edit locally first: a failed update must not lose it.
      this.#repository.saveLocalDefinition(link.id, body, this.#timestamp());
      const revision = expectedRevision ?? link.syncedRevision ?? link.item?.revision;
      if (!revision) throw new ChaosApiError('INVALID_INPUT', 'Refresh this item before updating it, so Max knows which Chaos version it is changing.');
      // A newer edit supersedes an update that never got an answer. If that one did reach Chaos, this one meets a revision conflict instead of overwriting blindly.
      this.#repository.deleteOperationsForLink(link.id, 'update_draft');
      return this.#repository.insertOperation({
        connectionId: connection.id, ifMatch: revision, itemId: link.itemId, linkId: link.id, operation: 'update_draft', pageId: link.pageId, request: body,
      }, this.#timestamp());
    }).then((created) => created.ok ? this.#runOperation(created.value.id) : created);
  }

  listPendingOperations(pageId: string): Promise<ChaosResult<readonly ChaosPendingOperation[]>> {
    return this.#guard(() => this.#repository.listOperations(pageId).map((operation) => ({
      attempts: operation.attempts,
      createdAt: operation.createdAt,
      id: operation.id,
      itemId: operation.itemId,
      kind: operation.operation,
      lastErrorCode: operation.lastErrorCode,
      pageId: operation.pageId,
      request: operation.request,
      title: operation.request.title,
    })));
  }

  /** Send a pending operation again with the key and body it was created with. */
  retryOperation(operationId: string): Promise<ChaosResult<ChaosCreateOutcome>> {
    return this.#runOperation(operationId);
  }

  discardOperation(operationId: string): Promise<ChaosResult<null>> {
    return this.#guard(() => {
      if (this.#inFlightOperations.has(operationId)) throw new ChaosApiError('INVALID_INPUT', 'This request is being sent right now.');
      this.#repository.deleteOperation(operationId);
      return null;
    });
  }

  #runOperation(operationId: string): Promise<ChaosResult<ChaosCreateOutcome>> {
    const existing = this.#inFlightOperations.get(operationId);
    if (existing) return existing;
    const run = this.#send(operationId).finally(() => this.#inFlightOperations.delete(operationId));
    this.#inFlightOperations.set(operationId, run);
    return run;
  }

  async #send(operationId: string): Promise<ChaosResult<ChaosCreateOutcome>> {
    const operation = this.#repository.getOperation(operationId);
    if (!operation) return fail('INVALID_INPUT', 'That request was already completed or discarded.');
    let active: ActiveConnection;
    try {
      active = await this.#active();
      if (active.connection.id !== operation.connectionId) throw new ChaosApiError('NOT_CONNECTED', 'This request was made with a different Chaos connection. Reconnect it, or discard the request.');
    } catch (error) {
      this.#repository.recordAttempt(operation.id, error instanceof ChaosApiError ? error.code : 'UNKNOWN', this.#timestamp());
      return { error: toError(error, { operationId: operation.id }), ok: false };
    }
    try {
      const result = operation.operation === 'create_draft'
        ? await active.client.createDraft(operation.request as ChaosDraftRequest, operation.idempotencyKey)
        : await active.client.updateDraft(operation.itemId as string, operation.request, operation.ifMatch as string, operation.idempotencyKey);
      const definition = stripKind({ kind: result.item.kind, ...operation.request });
      const linkId = this.#repository.transaction(() => {
        const link = operation.operation === 'create_draft' || !operation.linkId || !this.#repository.getLink(operation.linkId)
          ? this.#repository.insertLink({ connectionId: operation.connectionId, item: result.item, pageId: operation.pageId, syncedDefinition: definition }, this.#timestamp())
          : this.#repository.getLink(operation.linkId) as ChaosLinkRecord;
        this.#repository.updateLinkCache(link.id, { item: result.item, itemFetchedAt: this.#timestamp(), state: 'ok' }, this.#timestamp());
        this.#repository.markSynced(link.id, definition, result.item.revision, this.#timestamp());
        this.#repository.deleteOperation(operation.id);
        return link.id;
      });
      return { ok: true, value: { link: await this.#linkView(linkId), warnings: result.warnings } };
    } catch (error) {
      return this.#operationFailed(operation, active, error);
    }
  }

  async #operationFailed(operation: ChaosOperationRecord, active: ActiveConnection, error: unknown): Promise<ChaosResult<ChaosCreateOutcome>> {
    const code: ChaosErrorCode = error instanceof ChaosApiError ? error.code : 'UNKNOWN';
    if (KEEP_OPERATION.has(code)) {
      this.#repository.recordAttempt(operation.id, code, this.#timestamp());
      return { error: toError(error, { operationId: operation.id }), ok: false };
    }
    this.#repository.deleteOperation(operation.id);
    if (code !== 'REVISION_CONFLICT' || !(error instanceof ChaosApiError)) return { error: toError(error), ok: false };

    // Show both sides: the item as Chaos holds it now and, when readable, its fields.
    let currentItem: ChaosItem | undefined;
    const details = error.details as { item?: unknown } | undefined;
    try { currentItem = details?.item ? parseChaosItem(details.item) : undefined; } catch { currentItem = undefined; }
    if (!currentItem && operation.itemId) currentItem = await active.client.getItem(operation.itemId).catch(() => undefined);
    let currentDefinition: ChaosDefinition | undefined;
    if (operation.itemId && active.connection.scopes.includes('definitions:read')) {
      currentDefinition = await active.client.getDefinition(operation.itemId).then(({ definition }) => definition).catch(() => undefined);
    }
    if (currentItem && operation.linkId) {
      this.#repository.updateLinkCache(operation.linkId, { item: currentItem, itemFetchedAt: this.#timestamp(), state: 'ok' }, this.#timestamp());
    }
    return {
      error: toError(error, {
        ...(currentItem ? { currentItem } : {}),
        ...(currentDefinition ? { currentDefinition } : {}),
      }),
      ok: false,
    };
  }

  // Template copy ------------------------------------------------------------------------

  /** Copy a Chaos item's fields for reuse: fresh local ids, no responses, with a compatibility report. */
  copyTemplate(itemId: string): Promise<ChaosResult<ChaosTemplateCopy>> {
    return this.#guard(async () => {
      if (!isChaosItemId(itemId)) throw new ChaosApiError('INVALID_INPUT', 'Chaos item ids start with form_ or quiz_.');
      const { client, connection } = await this.#active();
      this.#requireScope(connection, 'definitions:read');
      const parsed = await client.getDefinition(itemId);
      const { compatibility, definition } = definitionToLocal(parsed.definition, parsed.unsupportedFields, true);
      return { compatibility, definition, kind: parsed.definition.kind, sourceItemId: itemId };
    });
  }
}
