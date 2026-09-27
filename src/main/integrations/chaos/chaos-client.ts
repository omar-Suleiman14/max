import {
  CHAOS_API_BASE_PATH,
  CHAOS_API_VERSION,
  CHAOS_TOKEN_PATTERN,
  ChaosContractError,
  chaosErrorCodeForStatus,
  isChaosErrorCode,
  isChaosItemId,
  parseChaosCapabilities,
  parseChaosDefinition,
  parseChaosDraftResult,
  parseChaosErrorEnvelope,
  parseChaosItem,
  parseChaosItemPage,
  parseChaosSummary,
  type ChaosCapabilities,
  type ChaosDraftRequest,
  type ChaosDraftResult,
  type ChaosDraftUpdateRequest,
  type ChaosErrorCode,
  type ChaosItem,
  type ChaosItemKind,
  type ChaosItemPage,
  type ChaosSummary,
  type ParsedChaosDefinition,
} from '../../../shared/chaos-integration-contract';

/**
 * A failed call to Chaos. `code` is one of the contract's codes or a client
 * code (network, timeout, unexpected response). Messages are safe to show and
 * never contain the token.
 */
export class ChaosApiError extends Error {
  constructor(
    readonly code: ChaosErrorCode,
    message: string,
    readonly status?: number,
    readonly details?: unknown,
    readonly retryAfterSeconds?: number,
    /** Problems found before sending, in plain words. */
    readonly problems?: readonly string[],
  ) {
    super(message);
    this.name = 'ChaosApiError';
  }
}

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

/**
 * Normalise what someone pasted as the Chaos API origin.
 *
 * Accepts the origin itself or a URL that already includes the integration
 * path. Requires HTTPS, except on the local machine where a self-hosted Chaos
 * under development may use plain HTTP. Credentials, queries and fragments are
 * refused because they would be sent with every request.
 */
export function normalizeChaosOrigin(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new ChaosApiError('INVALID_INPUT', 'Enter the Chaos API address, for example https://example-123.convex.site.');
  }
  const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new ChaosApiError('INVALID_INPUT', 'The Chaos address must use HTTPS (plain HTTP is allowed only for this computer).');
  }
  if (url.username || url.password) throw new ChaosApiError('INVALID_INPUT', 'Remove the user name or password from the address.');
  if (url.search || url.hash) throw new ChaosApiError('INVALID_INPUT', 'Remove the query or fragment from the address.');
  let path = url.pathname.replace(/\/+$/, '');
  const suffix = CHAOS_API_BASE_PATH;
  if (path.endsWith(suffix)) path = path.slice(0, -suffix.length);
  return `${url.protocol}//${url.host}${path}`;
}

export function assertChaosToken(token: string): string {
  const trimmed = token.trim();
  if (!CHAOS_TOKEN_PATTERN.test(trimmed)) {
    throw new ChaosApiError('INVALID_INPUT', 'That does not look like a Chaos connection token. Tokens start with "chaos_" followed by 64 characters.');
  }
  return trimmed;
}

function assertItemId(id: string): string {
  if (!isChaosItemId(id)) throw new ChaosApiError('INVALID_INPUT', 'Chaos item ids start with form_ or quiz_.');
  return id;
}

const FRIENDLY: Partial<Record<ChaosErrorCode, string>> = {
  INSUFFICIENT_SCOPE: 'This connection is not allowed to do that. Grant the permission in Chaos, or use another token.',
  NOT_A_DRAFT: 'This item is published or has responses, so Chaos protects it from changes made here.',
  NOT_FOUND: 'Unavailable or access revoked. The item may have been deleted or is no longer shared with this connection.',
  RATE_LIMITED: 'Chaos asked Max to slow down. Try again shortly.',
  REVISION_CONFLICT: 'The Chaos draft changed since Max last saw it.',
  TOKEN_REVOKED: 'The Chaos token was revoked or has expired. Connect again with a new token.',
  UNAUTHORIZED: 'Chaos did not accept the token. Check it, or create a new one in Chaos.',
  UNSUPPORTED_VERSION: 'This Chaos server does not support the integration API version Max uses.',
};

export type ChaosClientOptions = Readonly<{
  apiOrigin: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  token: string;
}>;

/**
 * HTTP client for the Chaos integration API, used only in the main process.
 * Every response body is validated by the shared contract before it is
 * returned.
 */
export class ChaosClient {
  readonly apiOrigin: string;
  readonly #token: string;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;

  constructor({ apiOrigin, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS, token }: ChaosClientOptions) {
    this.apiOrigin = normalizeChaosOrigin(apiOrigin);
    this.#token = assertChaosToken(token);
    this.#fetch = fetchImpl;
    this.#timeoutMs = timeoutMs;
  }

  async #request(method: 'GET' | 'PATCH' | 'POST', path: string, options: Readonly<{
    body?: unknown;
    idempotencyKey?: string;
    ifMatch?: string;
  }> = {}): Promise<unknown> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${this.#token}`,
      'Chaos-Api-Version': CHAOS_API_VERSION,
    };
    let body: string | undefined;
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }
    if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
    if (options.ifMatch) headers['If-Match'] = options.ifMatch;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
    let response: Response;
    try {
      response = await this.#fetch(`${this.apiOrigin}${CHAOS_API_BASE_PATH}${path}`, {
        body,
        headers,
        method,
        redirect: 'error',
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) throw new ChaosApiError('TIMEOUT', 'Chaos did not answer in time. Showing the last saved information.');
      void error;
      throw new ChaosApiError('NETWORK', 'Could not reach Chaos. Check the internet connection. Showing the last saved information.');
    } finally {
      clearTimeout(timer);
    }

    let text: string;
    try {
      text = await response.text();
    } catch {
      throw new ChaosApiError('NETWORK', 'The connection to Chaos was interrupted.');
    }
    if (text.length > MAX_RESPONSE_BYTES) throw new ChaosApiError('INVALID_RESPONSE', 'Chaos sent a response larger than Max accepts.');
    let parsed: unknown = null;
    if (text) {
      try { parsed = JSON.parse(text); } catch { parsed = null; }
    }

    if (!response.ok) {
      const envelope = parseChaosErrorEnvelope(parsed);
      const code: ChaosErrorCode = envelope && isChaosErrorCode(envelope.error.code) ? envelope.error.code : chaosErrorCodeForStatus(response.status);
      const retryHeader = response.headers.get('retry-after');
      const retryAfter = retryHeader && /^\d{1,6}$/.test(retryHeader.trim()) ? Number(retryHeader.trim()) : undefined;
      const message = FRIENDLY[code] ?? (envelope?.error.message || `Chaos answered ${response.status}.`);
      throw new ChaosApiError(code, message, response.status, envelope?.error.details, retryAfter);
    }
    if (parsed === null) throw new ChaosApiError('INVALID_RESPONSE', 'Chaos sent a response Max could not read.');
    return parsed;
  }

  async #parsed<T>(work: () => Promise<unknown>, parse: (value: unknown) => T): Promise<T> {
    const value = await work();
    try {
      return parse(value);
    } catch (error) {
      if (error instanceof ChaosContractError) throw new ChaosApiError(error.code, error.message);
      throw error;
    }
  }

  getCapabilities(): Promise<ChaosCapabilities> {
    return this.#parsed(() => this.#request('GET', '/capabilities'), parseChaosCapabilities);
  }

  listItems(kind?: ChaosItemKind, cursor?: string): Promise<ChaosItemPage> {
    const query = new URLSearchParams();
    if (kind) query.set('kind', kind);
    if (cursor) query.set('cursor', cursor);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return this.#parsed(() => this.#request('GET', `/items${suffix}`), parseChaosItemPage);
  }

  getItem(id: string): Promise<ChaosItem> {
    return this.#parsed(() => this.#request('GET', `/items/${encodeURIComponent(assertItemId(id))}`), (value) => parseChaosItem(value));
  }

  getSummary(id: string): Promise<ChaosSummary> {
    return this.#parsed(() => this.#request('GET', `/items/${encodeURIComponent(assertItemId(id))}/summary`), parseChaosSummary);
  }

  getDefinition(id: string): Promise<ParsedChaosDefinition> {
    return this.#parsed(() => this.#request('GET', `/items/${encodeURIComponent(assertItemId(id))}/definition`), parseChaosDefinition);
  }

  createDraft(request: ChaosDraftRequest, idempotencyKey: string): Promise<ChaosDraftResult> {
    return this.#parsed(() => this.#request('POST', '/drafts', { body: request, idempotencyKey }), parseChaosDraftResult);
  }

  updateDraft(id: string, request: ChaosDraftUpdateRequest, revision: string, idempotencyKey: string): Promise<ChaosDraftResult> {
    return this.#parsed(
      () => this.#request('PATCH', `/items/${encodeURIComponent(assertItemId(id))}`, { body: request, idempotencyKey, ifMatch: revision }),
      parseChaosDraftResult,
    );
  }
}
