/**
 * Chaos integration API, version 1: the client half of the contract.
 *
 * Chaos owns forms, quizzes and their responses. Max keeps only a connection
 * (the token lives outside the workspace database), links from a local page to
 * a Chaos item, and allow-listed metadata plus aggregate summaries stamped with
 * the time they were fetched. Nothing here describes a respondent or an answer.
 *
 * Every value that arrives from the network goes through a validator in this
 * file. The validators copy only the fields they know into a fresh object, so a
 * server that starts returning more than the contract allows cannot make Max
 * store or show it.
 */

export const CHAOS_API_VERSION = '1';
export const CHAOS_API_BASE_PATH = '/api/integrations/v1';

export const CHAOS_ITEM_KINDS = ['form', 'quiz'] as const;
export type ChaosItemKind = (typeof CHAOS_ITEM_KINDS)[number];

export const CHAOS_ITEM_STATUSES = ['draft', 'live', 'closed', 'archived'] as const;
export type ChaosItemStatus = (typeof CHAOS_ITEM_STATUSES)[number];

export const CHAOS_SCOPES = ['items:read', 'drafts:create', 'drafts:update', 'summaries:read', 'definitions:read'] as const;
export type ChaosScope = (typeof CHAOS_SCOPES)[number];

export const CHAOS_FORM_FIELD_TYPES = [
  'text', 'textarea', 'choice', 'dropdown', 'multi_choice', 'number', 'email', 'phone', 'url',
  'date', 'time', 'rating', 'scale', 'ranking', 'matrix', 'statement', 'section',
] as const;
export const CHAOS_QUIZ_FIELD_TYPES = ['mcq', 'true_false', 'multi_select', 'written'] as const;
export type ChaosFormFieldType = (typeof CHAOS_FORM_FIELD_TYPES)[number];
export type ChaosQuizFieldType = (typeof CHAOS_QUIZ_FIELD_TYPES)[number];
export type ChaosFieldType = ChaosFormFieldType | ChaosQuizFieldType;

/** Field types whose definition carries a list of options. */
export const CHAOS_OPTION_FIELD_TYPES: readonly ChaosFieldType[] = ['choice', 'dropdown', 'multi_choice', 'ranking', 'matrix', 'mcq', 'multi_select'];

export const CHAOS_LIMITS = Object.freeze({
  descriptionLength: 5000,
  fieldIdPattern: /^[A-Za-z][A-Za-z0-9_-]{0,79}$/,
  labelLength: 500,
  maxFields: 200,
  maxOptions: 50,
  requestBytes: 256 * 1024,
  titleLength: 200,
});

export const CHAOS_TOKEN_PATTERN = /^chaos_[0-9a-f]{64}$/;

export type ChaosItem = Readonly<{
  createdByThisConnection: boolean;
  editPath: string;
  editUrl: string | null;
  hasUnpublishedChanges: boolean;
  id: string;
  kind: ChaosItemKind;
  resultsPath: string;
  resultsUrl: string | null;
  revision: string;
  sharePath: string | null;
  shareUrl: string | null;
  status: ChaosItemStatus;
  title: string;
  updatedAt: number;
}>;

export type ChaosField = Readonly<{
  correctAnswer?: string;
  correctAnswers?: readonly string[];
  description?: string;
  id: string;
  keywords?: readonly string[];
  label: string;
  max?: number;
  min?: number;
  options?: readonly string[];
  points?: number;
  required?: boolean;
  rows?: readonly string[];
  type: ChaosFieldType;
}>;

export type ChaosDraftRequest = Readonly<{
  description?: string;
  fields: readonly ChaosField[];
  kind: ChaosItemKind;
  source?: Readonly<{ label?: string }>;
  title: string;
}>;

/** `PATCH /items/{id}` takes the draft body without `kind`. */
export type ChaosDraftUpdateRequest = Omit<ChaosDraftRequest, 'kind'>;

export type ChaosDraftResult = Readonly<{ item: ChaosItem; warnings: readonly string[] }>;

export type ChaosItemPage = Readonly<{ items: readonly ChaosItem[]; nextCursor: string | null }>;

export type ChaosSummaryBucket = Readonly<{ count: number | null; option: string }>;
export type ChaosSummaryQuestion = Readonly<{
  answeredCount: number | null;
  distribution?: readonly ChaosSummaryBucket[];
  fieldId: string;
  label: string;
  type: string;
}>;

export type ChaosSummary = Readonly<{
  averageScorePercent: number | null;
  completedCount: number | null;
  itemId: string;
  kind: ChaosItemKind;
  minimumGroupSize: number;
  questions: readonly ChaosSummaryQuestion[];
  responseCount: number | null;
  status: ChaosItemStatus;
  suppressed: boolean;
  updatedAt: number;
}>;

export type ChaosDefinition = Readonly<{
  compatibility: Readonly<{ dropped: readonly string[] }>;
  description?: string;
  fields: readonly ChaosField[];
  kind: ChaosItemKind;
  title: string;
}>;

export type ChaosCapabilities = Readonly<{
  apiVersion: string;
  connection: Readonly<{
    access: 'all' | 'selected';
    createdAt: number;
    expiresAt: number | null;
    id: string;
    label: string;
  }>;
  fieldTypes: Readonly<{ form: readonly ChaosFormFieldType[]; quiz: readonly ChaosQuizFieldType[] }>;
  limits: Readonly<{ maxFields: number; minimumGroupSize: number }>;
  scopes: readonly ChaosScope[];
  supportedKinds: readonly ChaosItemKind[];
  supportedVersions: readonly string[];
  workspace: Readonly<{ id: string; name: string }>;
}>;

/** Error codes the server documents, plus the ones the client produces itself. */
export const CHAOS_SERVER_ERROR_CODES = [
  'UNSUPPORTED_VERSION', 'VALIDATION_FAILED', 'IDEMPOTENCY_KEY_REQUIRED', 'UNAUTHORIZED', 'TOKEN_REVOKED',
  'INSUFFICIENT_SCOPE', 'NOT_FOUND', 'REVISION_CONFLICT', 'NOT_A_DRAFT', 'IDEMPOTENCY_KEY_REUSED', 'RATE_LIMITED',
] as const;
export const CHAOS_CLIENT_ERROR_CODES = [
  'NETWORK', 'TIMEOUT', 'SERVER_ERROR', 'INVALID_RESPONSE', 'INVALID_INPUT', 'NOT_CONNECTED',
  'SECURE_STORAGE_UNAVAILABLE', 'UNAVAILABLE', 'UNKNOWN',
] as const;
export type ChaosErrorCode = (typeof CHAOS_SERVER_ERROR_CODES)[number] | (typeof CHAOS_CLIENT_ERROR_CODES)[number];

export type ChaosErrorEnvelope = Readonly<{ error: Readonly<{ code: string; details?: unknown; message: string }> }>;

export type ChaosError = Readonly<{
  code: ChaosErrorCode;
  /** The item as Chaos holds it now, sent with `REVISION_CONFLICT`. */
  currentItem?: ChaosItem;
  /** Current Chaos definition, when it could be read, so both sides can be shown. */
  currentDefinition?: ChaosDefinition;
  message: string;
  /** Validation problems reported by the server, as plain strings. */
  problems?: readonly string[];
  /** A create or update that may be retried with the same key. */
  operationId?: string;
  retryAfterSeconds?: number;
}>;

export type ChaosResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ error: ChaosError; ok: false }>;

// ---------------------------------------------------------------------------
// User-facing states
// ---------------------------------------------------------------------------

/**
 * What a linked card or the connection shows. `offline` and `unavailable`
 * keep showing the cached data with the time it was fetched.
 */
export type ChaosLinkState =
  | 'ok'
  | 'offline'
  | 'unavailable'
  | 'unauthorized'
  | 'revoked'
  | 'rate-limited'
  | 'unsupported-version'
  | 'insufficient-scope'
  | 'disconnected'
  | 'error';

export type ChaosErrorPresentation = Readonly<{
  /** True when repeating the same request (same idempotency key) is safe and may succeed. */
  retryable: boolean;
  state: ChaosLinkState;
}>;

/** Map a failure to the state the interface shows. */
export function presentChaosError(code: ChaosErrorCode): ChaosErrorPresentation {
  switch (code) {
    case 'NETWORK':
    case 'TIMEOUT':
      return { retryable: true, state: 'offline' };
    case 'SERVER_ERROR':
      return { retryable: true, state: 'error' };
    case 'RATE_LIMITED':
      return { retryable: true, state: 'rate-limited' };
    case 'UNAUTHORIZED':
      return { retryable: false, state: 'unauthorized' };
    case 'TOKEN_REVOKED':
      return { retryable: false, state: 'revoked' };
    case 'NOT_FOUND':
      return { retryable: false, state: 'unavailable' };
    case 'UNSUPPORTED_VERSION':
      return { retryable: false, state: 'unsupported-version' };
    case 'INSUFFICIENT_SCOPE':
      return { retryable: false, state: 'insufficient-scope' };
    case 'NOT_CONNECTED':
      return { retryable: false, state: 'disconnected' };
    default:
      return { retryable: false, state: 'error' };
  }
}

export function isChaosErrorCode(value: unknown): value is ChaosErrorCode {
  return typeof value === 'string'
    && ((CHAOS_SERVER_ERROR_CODES as readonly string[]).includes(value) || (CHAOS_CLIENT_ERROR_CODES as readonly string[]).includes(value));
}

/** The code implied by an HTTP status when the body carried no usable envelope. */
export function chaosErrorCodeForStatus(status: number): ChaosErrorCode {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'INSUFFICIENT_SCOPE';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'REVISION_CONFLICT';
  if (status === 422) return 'IDEMPOTENCY_KEY_REUSED';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'SERVER_ERROR';
  if (status === 400) return 'VALIDATION_FAILED';
  return 'UNKNOWN';
}

// ---------------------------------------------------------------------------
// Local records the renderer sees. None of them carries the token.
// ---------------------------------------------------------------------------

export type ChaosConnectionState =
  /** No connection has been set up. */
  | 'none'
  | 'connected'
  /** The person disconnected; links remain but cannot refresh. */
  | 'disconnected'
  /** A connection row exists (for example from a restored backup) but this machine holds no token for it. */
  | 'needs-token';

export type ChaosConnectionStatus = Readonly<{
  access: 'all' | 'selected' | null;
  apiOrigin: string | null;
  connectionLabel: string | null;
  /** Kinds and field types the server said it accepts. */
  fieldTypes: ChaosCapabilities['fieldTypes'] | null;
  lastCheckedAt: string | null;
  limits: ChaosCapabilities['limits'] | null;
  scopes: readonly ChaosScope[];
  /** Whether the operating system can encrypt the token for this user. */
  secureStorageAvailable: boolean;
  state: ChaosConnectionState;
  workspaceName: string | null;
}>;

/** Result of "Test connection": what the token grants, never the token. */
export type ChaosConnectionTest = Readonly<{
  access: 'all' | 'selected';
  apiOrigin: string;
  connectionLabel: string;
  expiresAt: number | null;
  scopes: readonly ChaosScope[];
  supportedKinds: readonly ChaosItemKind[];
  workspaceName: string;
}>;

/** Max-authored definition kept with a link so it can be edited and re-sent. */
export type ChaosLocalDefinition = Readonly<{
  description?: string;
  fields: readonly ChaosField[];
  title: string;
}>;

export type ChaosLinkView = Readonly<{
  /** False when the link belongs to a connection that is not the active one, or it is disconnected. */
  connected: boolean;
  createdAt: string;
  id: string;
  item: ChaosItem | null;
  itemFetchedAt: string | null;
  itemId: string;
  kind: ChaosItemKind;
  lastErrorCode: ChaosErrorCode | null;
  /** Max's own copy of the fields, when the item was created or edited from Max. */
  localDefinition: ChaosLocalDefinition | null;
  /** The local definition changed after it was last sent to Chaos. */
  localChanges: boolean;
  pageId: string;
  state: ChaosLinkState;
  summary: ChaosSummary | null;
  summaryFetchedAt: string | null;
  /** The field list as Chaos last had it, according to Max. Used for the change preview. */
  syncedDefinition: ChaosLocalDefinition | null;
  syncedRevision: string | null;
}>;

export type ChaosPendingOperation = Readonly<{
  attempts: number;
  createdAt: string;
  id: string;
  itemId: string | null;
  kind: 'create_draft' | 'update_draft';
  lastErrorCode: ChaosErrorCode | null;
  pageId: string;
  /** The exact body that will be sent again, for display. */
  request: ChaosDraftRequest | ChaosDraftUpdateRequest;
  title: string;
}>;

export type ChaosCreateOutcome = Readonly<{ link: ChaosLinkView; warnings: readonly string[] }>;

export type ChaosCompatibilityReport = Readonly<{
  /** Reported by Chaos as left out of the definition (theme, uploads, ...). */
  droppedByChaos: readonly string[];
  /** Fields Max could not represent and left out. */
  droppedByMax: readonly string[];
  /** Kept, with a note about something that changed on the way in. */
  notes: readonly string[];
}>;

export type ChaosTemplateCopy = Readonly<{
  compatibility: ChaosCompatibilityReport;
  definition: ChaosLocalDefinition;
  kind: ChaosItemKind;
  sourceItemId: string;
}>;

export type ChaosRefreshResult = Readonly<{ links: readonly ChaosLinkView[]; refreshed: number; skipped: number }>;

export type ChaosApi = Readonly<{
  getStatus: () => Promise<ChaosConnectionStatus>;
  testConnection: (apiOrigin: string, token: string) => Promise<ChaosResult<ChaosConnectionTest>>;
  saveConnection: (apiOrigin: string, token: string) => Promise<ChaosResult<ChaosConnectionStatus>>;
  disconnect: () => Promise<ChaosResult<ChaosConnectionStatus>>;
  listItems: (kind?: ChaosItemKind, cursor?: string) => Promise<ChaosResult<ChaosItemPage>>;
  listLinks: (pageId: string) => Promise<ChaosResult<readonly ChaosLinkView[]>>;
  refreshLinks: (pageId: string, force?: boolean) => Promise<ChaosResult<ChaosRefreshResult>>;
  linkExisting: (pageId: string, itemId: string) => Promise<ChaosResult<ChaosLinkView>>;
  unlink: (linkId: string) => Promise<ChaosResult<null>>;
  createDraft: (pageId: string, request: ChaosDraftRequest) => Promise<ChaosResult<ChaosCreateOutcome>>;
  saveLocalDefinition: (linkId: string, definition: ChaosLocalDefinition) => Promise<ChaosResult<ChaosLinkView>>;
  /** Read the item's definition from Chaos and make it Max's copy (discarding unsent local edits). */
  adoptChaosDefinition: (linkId: string) => Promise<ChaosResult<ChaosLinkView>>;
  updateDraft: (linkId: string, definition: ChaosLocalDefinition, expectedRevision?: string) => Promise<ChaosResult<ChaosCreateOutcome>>;
  listPendingOperations: (pageId: string) => Promise<ChaosResult<readonly ChaosPendingOperation[]>>;
  retryOperation: (operationId: string) => Promise<ChaosResult<ChaosCreateOutcome>>;
  discardOperation: (operationId: string) => Promise<ChaosResult<null>>;
  /** Copy an item's definition as a template: fresh local ids, never responses. */
  copyTemplate: (itemId: string) => Promise<ChaosResult<ChaosTemplateCopy>>;
}>;

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

export class ChaosContractError extends Error {
  constructor(message: string, readonly code: 'INVALID_RESPONSE' | 'UNSUPPORTED_VERSION' = 'INVALID_RESPONSE') {
    super(message);
    this.name = 'ChaosContractError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(path: string, expected: string): never {
  throw new ChaosContractError(`Chaos sent an unexpected response: ${path} should be ${expected}.`);
}

function str(record: Record<string, unknown>, key: string, path: string, max = 10_000): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length > max) fail(`${path}.${key}`, 'text');
  return value;
}

function nullableStr(record: Record<string, unknown>, key: string, path: string, max = 4000): string | null {
  const value = record[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || value.length > max) fail(`${path}.${key}`, 'text or null');
  return value;
}

function num(record: Record<string, unknown>, key: string, path: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${path}.${key}`, 'a number');
  return value;
}

function nullableNum(record: Record<string, unknown>, key: string, path: string): number | null {
  const value = record[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${path}.${key}`, 'a number or null');
  return value;
}

function oneOf<T extends string>(record: Record<string, unknown>, key: string, allowed: readonly T[], path: string): T {
  const value = record[key];
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) fail(`${path}.${key}`, `one of ${allowed.join(', ')}`);
  return value as T;
}

function stringList(value: unknown, path: string, maxItems = 500, maxLength = 4000): string[] {
  if (!Array.isArray(value) || value.length > maxItems) fail(path, 'a list of text');
  return value.map((entry, index) => {
    if (typeof entry !== 'string' || entry.length > maxLength) fail(`${path}[${index}]`, 'text');
    return entry;
  });
}

/** Paths from Chaos are app-relative; anything else is refused rather than opened. */
function relativePath(record: Record<string, unknown>, key: string, path: string, nullable: boolean): string | null {
  const value = nullable ? nullableStr(record, key, path) : str(record, key, path, 4000);
  if (value !== null && (!value.startsWith('/') || value.startsWith('//'))) fail(`${path}.${key}`, 'an app path starting with "/"');
  return value;
}

/** Only http(s) URLs are kept; a URL with credentials or another scheme becomes null. */
function webUrl(record: Record<string, unknown>, key: string, path: string): string | null {
  const value = nullableStr(record, key, path);
  if (value === null) return null;
  try {
    const url = new URL(value);
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function isChaosItemId(value: unknown): value is string {
  return typeof value === 'string' && /^(form|quiz)_[^\s/?#]{1,200}$/.test(value);
}

export function parseChaosItem(value: unknown, path = 'item'): ChaosItem {
  if (!isRecord(value)) fail(path, 'an object');
  const id = str(value, 'id', path, 220);
  if (!isChaosItemId(id)) fail(`${path}.id`, 'an id starting with form_ or quiz_');
  const kind = oneOf(value, 'kind', CHAOS_ITEM_KINDS, path);
  if (!id.startsWith(`${kind}_`)) fail(`${path}.id`, `an id matching its kind (${kind})`);
  return {
    createdByThisConnection: value.createdByThisConnection === true,
    editPath: relativePath(value, 'editPath', path, false) as string,
    editUrl: webUrl(value, 'editUrl', path),
    hasUnpublishedChanges: value.hasUnpublishedChanges === true,
    id,
    kind,
    resultsPath: relativePath(value, 'resultsPath', path, false) as string,
    resultsUrl: webUrl(value, 'resultsUrl', path),
    revision: str(value, 'revision', path, 200),
    sharePath: relativePath(value, 'sharePath', path, true),
    shareUrl: webUrl(value, 'shareUrl', path),
    status: oneOf(value, 'status', CHAOS_ITEM_STATUSES, path),
    title: str(value, 'title', path, CHAOS_LIMITS.titleLength * 4),
    updatedAt: num(value, 'updatedAt', path),
  };
}

export function parseChaosItemPage(value: unknown): ChaosItemPage {
  if (!isRecord(value) || !Array.isArray(value.items)) fail('response', 'an object with an items list');
  if (value.items.length > 200) fail('items', 'at most 200 entries');
  return {
    items: value.items.map((entry, index) => parseChaosItem(entry, `items[${index}]`)),
    nextCursor: nullableStr(value, 'nextCursor', 'response', 2000),
  };
}

export function parseChaosDraftResult(value: unknown): ChaosDraftResult {
  if (!isRecord(value)) fail('response', 'an object');
  return {
    item: parseChaosItem(value.item),
    warnings: value.warnings === undefined ? [] : stringList(value.warnings, 'warnings', 200, 2000),
  };
}

const ALL_FIELD_TYPES: readonly ChaosFieldType[] = [...CHAOS_FORM_FIELD_TYPES, ...CHAOS_QUIZ_FIELD_TYPES];

export function isChaosFieldType(value: unknown): value is ChaosFieldType {
  return typeof value === 'string' && (ALL_FIELD_TYPES as readonly string[]).includes(value);
}

/**
 * A field as the definition endpoint returns it. Unknown field types are
 * reported rather than thrown, so one new Chaos field type does not stop the
 * whole template copy.
 */
export function parseChaosField(value: unknown, path: string): ChaosField | { unsupportedType: string; label: string } {
  if (!isRecord(value)) fail(path, 'an object');
  const label = str(value, 'label', path, CHAOS_LIMITS.labelLength * 4);
  if (!isChaosFieldType(value.type)) return { label, unsupportedType: typeof value.type === 'string' ? value.type.slice(0, 60) : 'unknown' };
  const field: {
    -readonly [K in keyof ChaosField]: ChaosField[K]
  } = { id: str(value, 'id', path, 80), label, type: value.type };
  if (typeof value.description === 'string') field.description = value.description.slice(0, CHAOS_LIMITS.descriptionLength);
  if (typeof value.required === 'boolean') field.required = value.required;
  if (value.options !== undefined) field.options = stringList(value.options, `${path}.options`, 500, 2000);
  if (value.rows !== undefined) field.rows = stringList(value.rows, `${path}.rows`, 500, 2000);
  if (typeof value.min === 'number' && Number.isFinite(value.min)) field.min = value.min;
  if (typeof value.max === 'number' && Number.isFinite(value.max)) field.max = value.max;
  if (typeof value.correctAnswer === 'string') field.correctAnswer = value.correctAnswer.slice(0, 4000);
  if (value.correctAnswers !== undefined) field.correctAnswers = stringList(value.correctAnswers, `${path}.correctAnswers`);
  if (value.keywords !== undefined) field.keywords = stringList(value.keywords, `${path}.keywords`);
  if (typeof value.points === 'number' && Number.isFinite(value.points)) field.points = value.points;
  return field;
}

export type ParsedChaosDefinition = Readonly<{
  definition: ChaosDefinition;
  unsupportedFields: readonly string[];
}>;

export function parseChaosDefinition(value: unknown): ParsedChaosDefinition {
  if (!isRecord(value) || !Array.isArray(value.fields)) fail('definition', 'an object with a fields list');
  if (value.fields.length > 1000) fail('definition.fields', 'at most 1000 entries');
  const fields: ChaosField[] = [];
  const unsupportedFields: string[] = [];
  value.fields.forEach((entry, index) => {
    const parsed = parseChaosField(entry, `fields[${index}]`);
    if ('unsupportedType' in parsed) unsupportedFields.push(`${parsed.label} (${parsed.unsupportedType})`);
    else fields.push(parsed);
  });
  const compatibility = isRecord(value.compatibility) && value.compatibility.dropped !== undefined
    ? stringList(value.compatibility.dropped, 'compatibility.dropped', 500, 500)
    : [];
  return {
    definition: {
      compatibility: { dropped: compatibility },
      description: typeof value.description === 'string' ? value.description.slice(0, CHAOS_LIMITS.descriptionLength) : undefined,
      fields,
      kind: oneOf(value, 'kind', CHAOS_ITEM_KINDS, 'definition'),
      title: str(value, 'title', 'definition', CHAOS_LIMITS.titleLength * 4),
    },
    unsupportedFields,
  };
}

/**
 * Aggregates only. A question keeps its id, label, type and counts; a bucket
 * keeps an option label and a count. When the server marks the summary as
 * suppressed, the count and every question are discarded here whatever else
 * the body contains.
 */
export function parseChaosSummary(value: unknown): ChaosSummary {
  if (!isRecord(value)) fail('summary', 'an object');
  const suppressed = value.suppressed === true;
  const minimumGroupSize = num(value, 'minimumGroupSize', 'summary');
  const responseCount = nullableNum(value, 'responseCount', 'summary');
  // A count below the group size is never shown, even if a server sent one.
  const hidden = suppressed || responseCount === null || responseCount < minimumGroupSize;
  const questions = hidden || !Array.isArray(value.questions) ? [] : value.questions.slice(0, 500).map((entry, index): ChaosSummaryQuestion => {
    const path = `summary.questions[${index}]`;
    if (!isRecord(entry)) fail(path, 'an object');
    const distribution = Array.isArray(entry.distribution)
      ? entry.distribution.slice(0, 200).map((bucket, bucketIndex): ChaosSummaryBucket => {
        if (!isRecord(bucket)) fail(`${path}.distribution[${bucketIndex}]`, 'an object');
        const count = nullableNum(bucket, 'count', `${path}.distribution[${bucketIndex}]`);
        return { count: count !== null && count < minimumGroupSize ? null : count, option: str(bucket, 'option', `${path}.distribution[${bucketIndex}]`, 2000) };
      })
      : undefined;
    return {
      answeredCount: nullableNum(entry, 'answeredCount', path),
      ...(distribution ? { distribution } : {}),
      fieldId: str(entry, 'fieldId', path, 80),
      label: str(entry, 'label', path, 2000),
      type: str(entry, 'type', path, 60),
    };
  });
  return {
    averageScorePercent: hidden ? null : nullableNum(value, 'averageScorePercent', 'summary'),
    completedCount: hidden ? null : nullableNum(value, 'completedCount', 'summary'),
    itemId: str(value, 'itemId', 'summary', 220),
    kind: oneOf(value, 'kind', CHAOS_ITEM_KINDS, 'summary'),
    minimumGroupSize,
    questions,
    responseCount: hidden ? null : responseCount,
    status: oneOf(value, 'status', CHAOS_ITEM_STATUSES, 'summary'),
    suppressed: hidden,
    updatedAt: num(value, 'updatedAt', 'summary'),
  };
}

export function parseChaosCapabilities(value: unknown): ChaosCapabilities {
  if (!isRecord(value)) fail('capabilities', 'an object');
  const apiVersion = str(value, 'apiVersion', 'capabilities', 20);
  if (apiVersion !== CHAOS_API_VERSION) {
    throw new ChaosContractError(
      `This Chaos server speaks integration API version ${apiVersion}. This Max build supports version ${CHAOS_API_VERSION} only.`,
      'UNSUPPORTED_VERSION',
    );
  }
  const supportedVersions = value.supportedVersions === undefined ? [apiVersion] : stringList(value.supportedVersions, 'capabilities.supportedVersions', 20, 20);
  if (!supportedVersions.includes(CHAOS_API_VERSION)) {
    throw new ChaosContractError(`This Chaos server does not list API version ${CHAOS_API_VERSION} as supported.`, 'UNSUPPORTED_VERSION');
  }
  const scopes = stringList(value.scopes, 'capabilities.scopes', 50, 60)
    .filter((scope): scope is ChaosScope => (CHAOS_SCOPES as readonly string[]).includes(scope));
  const supportedKinds = stringList(value.supportedKinds ?? [...CHAOS_ITEM_KINDS], 'capabilities.supportedKinds', 10, 20)
    .filter((kind): kind is ChaosItemKind => (CHAOS_ITEM_KINDS as readonly string[]).includes(kind));
  const fieldTypes = isRecord(value.fieldTypes) ? value.fieldTypes : {};
  const formTypes = (fieldTypes.form === undefined ? [...CHAOS_FORM_FIELD_TYPES] : stringList(fieldTypes.form, 'capabilities.fieldTypes.form', 100, 60))
    .filter((type): type is ChaosFormFieldType => (CHAOS_FORM_FIELD_TYPES as readonly string[]).includes(type));
  const quizTypes = (fieldTypes.quiz === undefined ? [...CHAOS_QUIZ_FIELD_TYPES] : stringList(fieldTypes.quiz, 'capabilities.fieldTypes.quiz', 100, 60))
    .filter((type): type is ChaosQuizFieldType => (CHAOS_QUIZ_FIELD_TYPES as readonly string[]).includes(type));
  const limits = isRecord(value.limits) ? value.limits : {};
  if (!isRecord(value.workspace)) fail('capabilities.workspace', 'an object');
  if (!isRecord(value.connection)) fail('capabilities.connection', 'an object');
  const connection = value.connection;
  return {
    apiVersion,
    connection: {
      access: oneOf(connection, 'access', ['all', 'selected'] as const, 'capabilities.connection'),
      createdAt: typeof connection.createdAt === 'number' && Number.isFinite(connection.createdAt) ? connection.createdAt : 0,
      expiresAt: nullableNum(connection, 'expiresAt', 'capabilities.connection'),
      id: str(connection, 'id', 'capabilities.connection', 200),
      label: typeof connection.label === 'string' ? connection.label.slice(0, 200) : '',
    },
    fieldTypes: { form: formTypes, quiz: quizTypes },
    limits: {
      maxFields: typeof limits.maxFields === 'number' && limits.maxFields > 0 ? Math.min(limits.maxFields, CHAOS_LIMITS.maxFields) : CHAOS_LIMITS.maxFields,
      minimumGroupSize: typeof limits.minimumGroupSize === 'number' && limits.minimumGroupSize > 0 ? limits.minimumGroupSize : 5,
    },
    scopes,
    supportedKinds,
    supportedVersions,
    workspace: { id: str(value.workspace, 'id', 'capabilities.workspace', 200), name: str(value.workspace, 'name', 'capabilities.workspace', 500) },
  };
}

/** Returns the envelope when the body is one, otherwise null. */
export function parseChaosErrorEnvelope(value: unknown): ChaosErrorEnvelope | null {
  if (!isRecord(value) || !isRecord(value.error)) return null;
  const { code, message, details } = value.error;
  if (typeof code !== 'string' || code.length > 80) return null;
  return { error: { code, details, message: typeof message === 'string' ? message.slice(0, 2000) : '' } };
}

// ---------------------------------------------------------------------------
// Request validation, shared by the dialog (to explain) and main (to enforce)
// ---------------------------------------------------------------------------

export function fieldTypesForKind(kind: ChaosItemKind): readonly ChaosFieldType[] {
  return kind === 'form' ? CHAOS_FORM_FIELD_TYPES : CHAOS_QUIZ_FIELD_TYPES;
}

const QUIZ_ONLY_KEYS = ['correctAnswer', 'correctAnswers', 'keywords', 'points'] as const;

/** Problems with a draft body, in plain words. An empty list means it can be sent. */
export function validateChaosDraftRequest(request: ChaosDraftRequest, allowedTypes?: readonly ChaosFieldType[]): string[] {
  const problems: string[] = [];
  if (!(CHAOS_ITEM_KINDS as readonly string[]).includes(request.kind)) problems.push('Choose a form or a quiz.');
  if (!request.title.trim()) problems.push('Give it a title.');
  if (request.title.length > CHAOS_LIMITS.titleLength) problems.push(`The title is longer than ${CHAOS_LIMITS.titleLength} characters.`);
  if ((request.description?.length ?? 0) > CHAOS_LIMITS.descriptionLength) problems.push(`The description is longer than ${CHAOS_LIMITS.descriptionLength} characters.`);
  if (request.fields.length > CHAOS_LIMITS.maxFields) problems.push(`A draft can hold at most ${CHAOS_LIMITS.maxFields} fields.`);
  const types = allowedTypes ?? fieldTypesForKind(request.kind);
  const seen = new Set<string>();
  request.fields.forEach((field, index) => {
    const name = field.label.trim() ? `“${field.label.trim().slice(0, 40)}”` : `Field ${index + 1}`;
    if (!CHAOS_LIMITS.fieldIdPattern.test(field.id)) problems.push(`${name} has an invalid id.`);
    if (seen.has(field.id)) problems.push(`${name} repeats the id ${field.id}.`);
    seen.add(field.id);
    if (!field.label.trim()) problems.push(`${name} needs a label.`);
    if (field.label.length > CHAOS_LIMITS.labelLength) problems.push(`${name} has a label longer than ${CHAOS_LIMITS.labelLength} characters.`);
    if ((field.description?.length ?? 0) > CHAOS_LIMITS.descriptionLength) problems.push(`${name} has a description longer than ${CHAOS_LIMITS.descriptionLength} characters.`);
    if (!types.includes(field.type)) problems.push(`${name} uses ${field.type}, which a ${request.kind} cannot hold.`);
    if ((field.options?.length ?? 0) > CHAOS_LIMITS.maxOptions) problems.push(`${name} has more than ${CHAOS_LIMITS.maxOptions} options.`);
    if (CHAOS_OPTION_FIELD_TYPES.includes(field.type) && field.type !== 'matrix' && (field.options?.filter((option) => option.trim()).length ?? 0) < 2) {
      problems.push(`${name} needs at least two options.`);
    }
    if (request.kind === 'form' && QUIZ_ONLY_KEYS.some((key) => field[key] !== undefined)) problems.push(`${name} has quiz answer settings, which only quizzes use.`);
  });
  const bytes = new TextEncoder().encode(JSON.stringify(request)).byteLength;
  if (bytes > CHAOS_LIMITS.requestBytes) problems.push('The draft is larger than Chaos accepts (256 KiB).');
  return problems;
}

/**
 * Parse a draft body that crossed IPC from the renderer. It is rebuilt from
 * known keys only so nothing else reaches the network.
 */
export function parseChaosDraftRequestInput(value: unknown): ChaosDraftRequest {
  if (!isRecord(value)) throw new ChaosContractError('A draft needs a kind, a title and fields.');
  const kind = value.kind;
  if (kind !== 'form' && kind !== 'quiz') throw new ChaosContractError('Choose a form or a quiz.');
  const local = parseChaosLocalDefinitionInput(value);
  const source = isRecord(value.source) && typeof value.source.label === 'string' ? { label: value.source.label.slice(0, 200) } : undefined;
  return { kind, ...local, ...(source ? { source } : {}) };
}

export function parseChaosLocalDefinitionInput(value: unknown): ChaosLocalDefinition {
  if (!isRecord(value) || typeof value.title !== 'string' || !Array.isArray(value.fields)) {
    throw new ChaosContractError('A draft needs a title and a list of fields.');
  }
  if (value.fields.length > CHAOS_LIMITS.maxFields) throw new ChaosContractError(`A draft can hold at most ${CHAOS_LIMITS.maxFields} fields.`);
  const fields = value.fields.map((entry, index) => {
    const parsed = parseChaosField(entry, `fields[${index}]`);
    if ('unsupportedType' in parsed) throw new ChaosContractError(`Field ${index + 1} uses an unknown type.`);
    return parsed;
  });
  return {
    ...(typeof value.description === 'string' && value.description.trim() ? { description: value.description } : {}),
    fields,
    title: value.title,
  };
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export type ResponseCountDisplay =
  | Readonly<{ kind: 'count'; count: number }>
  | Readonly<{ kind: 'suppressed'; minimumGroupSize: number }>
  | Readonly<{ kind: 'unknown' }>;

/** How many responses to show, never a number under the group size. */
export function responseCountDisplay(summary: ChaosSummary | null): ResponseCountDisplay {
  if (!summary) return { kind: 'unknown' };
  if (summary.suppressed || summary.responseCount === null || summary.responseCount < summary.minimumGroupSize) {
    return { kind: 'suppressed', minimumGroupSize: summary.minimumGroupSize };
  }
  return { count: summary.responseCount, kind: 'count' };
}
