import { invoke } from '@tauri-apps/api/core';
import { logDebug, logException } from './logger';

// ── DTO Interfaces ──────────────────────────────────────────────────────────

export interface ProtocolEnvelope<T> {
  protocol_version: number;
  request_id?: string;
  client_id?: string;
  window_label?: string;
  session_id?: number;
  payload: T;
}

export interface DocumentOpenedDto {
  protocol_version: number;
  session_id: number;
  document_id: number;
  revision: number;
  persisted_revision: number;
  text: string;
  size_class: string;
  file_identity: FileIdentityDto;
  outline: OutlineItemDto[];
  stats: DocumentStatsDto;
  capabilities: DocumentCapabilitiesDto;
}

export interface FileIdentityDto {
  canonical_path: string | null;
  size: number;
  fingerprint_hash: string;
}

export interface OutlineItemDto {
  level: number;
  text: string;
  line: number;
}

export interface DocumentStatsDto {
  line_count: number;
  byte_count: number;
}

export interface DocumentCapabilitiesDto {
  writable: boolean;
  patch_editing: boolean;
  core_save: boolean;
}

export interface Utf16ChangeDto {
  from: number;
  to: number;
  insert: string;
}

export interface Utf16TextPatchDto {
  transaction_id: string;
  base_revision: number;
  changes: Utf16ChangeDto[];
  selection_after?: SelectionDto | null;
}

export interface SelectionDto {
  anchor: number;
  head: number;
}

export interface ApplyPatchAckDto {
  transaction_id: string;
  revision: number;
}

export interface SaveResultDto {
  revision: number;
  file_identity: FileIdentityDto;
}

export interface ResyncResultDto {
  revision: number;
  text: string;
}

export interface FlushResultDto {
  revision: number;
}

export interface DocumentTextResultDto {
  text: string;
  revision: number;
}

export interface OutlineResultDto {
  items: OutlineItemDto[];
}

export interface ReloadResultDto {
  revision: number;
  text: string;
  file_identity: FileIdentityDto;
}

export interface UiRangeDto {
  start: number;
  end: number;
}

export interface LineRangeDto {
  start: number;
  end: number;
}

export type RenderBlockKindDto =
  | 'heading'
  | 'paragraph'
  | 'blockquote'
  | 'bullet_list'
  | 'ordered_list'
  | 'task_list'
  | 'code_fence'
  | 'image'
  | 'unknown';

export type RenderInlineKindDto =
  | 'strong'
  | 'emphasis'
  | 'inline_code'
  | 'link'
  | 'image_reference';

export interface RenderDocumentDto {
  session_id: number;
  document_id: number;
  revision: number;
  request_id: string;
  viewport: UiRangeDto;
  blocks: RenderBlockDto[];
  large_document: boolean;
}

export interface RenderBlockDto {
  id: string;
  kind: RenderBlockKindDto;
  level: number | null;
  source_range: UiRangeDto;
  content_range: UiRangeDto;
  line_range: LineRangeDto;
  text: string;
  inlines: RenderInlineDto[];
}

export interface RenderInlineDto {
  kind: RenderInlineKindDto;
  source_range: UiRangeDto;
  content_range: UiRangeDto;
  marker_ranges: UiRangeDto[];
  text: string;
  target: string | null;
}

// ── Error Handling ──────────────────────────────────────────────────────────

export class BridgeError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'BridgeError';
    this.code = code;
  }

  static fromInvokeError(err: unknown): BridgeError {
    if (err && typeof err === 'object') {
      const e = err as Record<string, unknown>;
      const code = typeof e.code === 'string' ? e.code : 'UNKNOWN';
      const message = typeof e.message === 'string' ? e.message : String(err);
      return new BridgeError(code, message);
    }
    return new BridgeError('UNKNOWN', String(err));
  }
}

// ── EditCommand DTOs ──────────────────────────────────────────────────────────

/** Allowed heading levels for SetHeading. */
export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

/** List kind for ToggleList. */
export type ListKindDto = 'Unordered' | 'Ordered';

/** Discriminated union mirroring EditCommandDto on the Rust side (`#[serde(tag = "type")]`). */
export type EditCommandDto =
  | { type: 'toggle_strong'; anchor: number; head: number }
  | { type: 'toggle_emphasis'; anchor: number; head: number }
  | { type: 'toggle_strikethrough'; anchor: number; head: number }
  | { type: 'toggle_inline_code'; anchor: number; head: number }
  | { type: 'set_heading'; anchor: number; head: number; level: HeadingLevel }
  | { type: 'toggle_block_quote'; anchor: number; head: number }
  | { type: 'toggle_list'; anchor: number; head: number; kind: ListKindDto }
  | { type: 'insert_code_fence'; position: number; language?: string | null }
  | { type: 'insert_link'; anchor: number; head: number; href: string; title?: string | null }
  | { type: 'insert_image'; position: number; reference: string; alt?: string | null };

/** Result of executing an edit command. */
export interface CommandResultDto {
  session_id: number;
  transaction_id: string;
  revision: number;
  selection_after: SelectionDto | null;
}

// ── Request ID Generator ────────────────────────────────────────────────────

let requestIdCounter = 0;

export function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `req_${Date.now()}_${++requestIdCounter}`;
}

// ── Bridge Options ──────────────────────────────────────────────────────────

export interface BridgeOptions {
  /** Optional window label for multi-window scenarios (reserved; used in apply_text_patch envelope). */
  windowLabel?: string;
}

// ── Core Invoke Bridge ──────────────────────────────────────────────────────

async function invokeBridge<T>(
  command: string,
  payload: Record<string, unknown>,
): Promise<T> {
  try {
    return await invoke<T>(command, payload);
  } catch (err) {
    throw BridgeError.fromInvokeError(err);
  }
}

// ── Public Command Functions ────────────────────────────────────────────────

/** Open a document by file path. Returns the initial document state. */
export async function openDocument(path: string): Promise<DocumentOpenedDto> {
  logDebug('bridge', 'openDocument', { path });
  try {
    const result = await invokeBridge<DocumentOpenedDto>('open_document', { path });
    logDebug('bridge', 'openDocument completed', { sessionId: result.session_id });
    return result;
  } catch (err) {
    logException('bridge', 'openDocument failed', err, { path });
    throw err;
  }
}

/** Apply a text patch to the document. Constructs the protocol envelope internally. */
export async function applyTextPatch(
  sessionId: number,
  patch: Utf16TextPatchDto,
  options?: BridgeOptions,
): Promise<ApplyPatchAckDto> {
  logDebug('bridge', 'applyTextPatch', {
    sessionId,
    transactionId: patch.transaction_id,
    baseRevision: patch.base_revision,
    changeCount: patch.changes.length,
  });
  try {
    const envelope: ProtocolEnvelope<Utf16TextPatchDto> = {
      protocol_version: 1,
      request_id: generateRequestId(),
      session_id: sessionId,
      window_label: options?.windowLabel,
      payload: patch,
    };
    const result = await invokeBridge<ApplyPatchAckDto>('apply_text_patch', { envelope });
    logDebug('bridge', 'applyTextPatch completed', {
      transactionId: result.transaction_id,
      revision: result.revision,
    });
    return result;
  } catch (err) {
    logException('bridge', 'applyTextPatch failed', err, {
      sessionId,
      transactionId: patch.transaction_id,
    });
    throw err;
  }
}

/** Save the document at the given session. */
export async function saveDocument(
  sessionId: number,
  _options?: BridgeOptions,
): Promise<SaveResultDto> {
  logDebug('bridge', 'saveDocument', { sessionId });
  try {
    const result = await invokeBridge<SaveResultDto>('save_document_command', {
      session_id: sessionId,
    });
    logDebug('bridge', 'saveDocument completed', { sessionId, revision: result.revision });
    return result;
  } catch (err) {
    logException('bridge', 'saveDocument failed', err, { sessionId });
    throw err;
  }
}

/** Resync the document to a confirmed revision. */
export async function resyncDocument(
  sessionId: number,
  confirmedRevision: number,
  _options?: BridgeOptions,
): Promise<ResyncResultDto> {
  logDebug('bridge', 'resyncDocument', { sessionId, confirmedRevision });
  try {
    const result = await invokeBridge<ResyncResultDto>('resync_document', {
      session_id: sessionId,
      confirmed_revision: confirmedRevision,
    });
    logDebug('bridge', 'resyncDocument completed', { sessionId, revision: result.revision });
    return result;
  } catch (err) {
    logException('bridge', 'resyncDocument failed', err, { sessionId, confirmedRevision });
    throw err;
  }
}

/** Flush pending changes to the document. */
export async function flushDocument(
  sessionId: number,
  _options?: BridgeOptions,
): Promise<FlushResultDto> {
  logDebug('bridge', 'flushDocument', { sessionId });
  try {
    const result = await invokeBridge<FlushResultDto>('flush_document', {
      session_id: sessionId,
    });
    logDebug('bridge', 'flushDocument completed', { sessionId, revision: result.revision });
    return result;
  } catch (err) {
    logException('bridge', 'flushDocument failed', err, { sessionId });
    throw err;
  }
}

/** Get the full document text. */
export async function getDocumentText(
  sessionId: number,
  _options?: BridgeOptions,
): Promise<DocumentTextResultDto> {
  logDebug('bridge', 'getDocumentText', { sessionId });
  try {
    const result = await invokeBridge<DocumentTextResultDto>('get_document_text', {
      session_id: sessionId,
    });
    logDebug('bridge', 'getDocumentText completed', { sessionId, revision: result.revision });
    return result;
  } catch (err) {
    logException('bridge', 'getDocumentText failed', err, { sessionId });
    throw err;
  }
}

/** Get viewport-scoped Render IR for Core-backed WYSIWYG. */
export async function getRenderBlocks(
  sessionId: number,
  revision: number,
  viewport: UiRangeDto,
  requestId = generateRequestId(),
  _options?: BridgeOptions,
): Promise<RenderDocumentDto> {
  logDebug('bridge', 'getRenderBlocks', {
    sessionId,
    revision,
    viewport,
    requestId,
  });
  try {
    const result = await invokeBridge<RenderDocumentDto>('get_render_blocks', {
      session_id: sessionId,
      revision,
      viewport,
      request_id: requestId,
    });
    logDebug('bridge', 'getRenderBlocks completed', {
      sessionId,
      revision: result.revision,
      requestId: result.request_id,
      blockCount: result.blocks.length,
    });
    return result;
  } catch (err) {
    logException('bridge', 'getRenderBlocks failed', err, {
      sessionId,
      revision,
      requestId,
    });
    throw err;
  }
}

/** Get the document outline (headings structure). */
export async function getOutline(
  sessionId: number,
  _options?: BridgeOptions,
): Promise<OutlineResultDto> {
  logDebug('bridge', 'getOutline', { sessionId });
  try {
    const result = await invokeBridge<OutlineResultDto>('get_outline', {
      session_id: sessionId,
    });
    logDebug('bridge', 'getOutline completed', { sessionId });
    return result;
  } catch (err) {
    logException('bridge', 'getOutline failed', err, { sessionId });
    throw err;
  }
}

/** Get document statistics (line count, byte count). */
export async function getDocumentStats(
  sessionId: number,
  _options?: BridgeOptions,
): Promise<DocumentStatsDto> {
  logDebug('bridge', 'getDocumentStats', { sessionId });
  try {
    const result = await invokeBridge<DocumentStatsDto>('get_document_stats', {
      session_id: sessionId,
    });
    logDebug('bridge', 'getDocumentStats completed', { sessionId });
    return result;
  } catch (err) {
    logException('bridge', 'getDocumentStats failed', err, { sessionId });
    throw err;
  }
}

/** Reload the document from disk. */
export async function reloadDocument(
  sessionId: number,
  _options?: BridgeOptions,
): Promise<ReloadResultDto> {
  logDebug('bridge', 'reloadDocument', { sessionId });
  try {
    const result = await invokeBridge<ReloadResultDto>('reload_document', {
      session_id: sessionId,
    });
    logDebug('bridge', 'reloadDocument completed', { sessionId, revision: result.revision });
    return result;
  } catch (err) {
    logException('bridge', 'reloadDocument failed', err, { sessionId });
    throw err;
  }
}

/** Close the document and release backend resources. */
export async function closeDocument(
  sessionId: number,
  _options?: BridgeOptions,
): Promise<void> {
  logDebug('bridge', 'closeDocument', { sessionId });
  try {
    return await invokeBridge<void>('close_document', {
      session_id: sessionId,
    });
  } catch (err) {
    logException('bridge', 'closeDocument failed', err, { sessionId });
    throw err;
  }
}

// ── Edit Command Functions ────────────────────────────────────────────────

/** Execute a semantic edit command on a Core document session. */
export async function executeEditCommand(
  sessionId: number,
  command: EditCommandDto,
  baseRevision: number,
  frontendTxnId: string,
  _options?: BridgeOptions,
): Promise<CommandResultDto> {
  logDebug('bridge', 'executeEditCommand', {
    sessionId,
    baseRevision,
    commandType: command.type,
  });
  try {
    const result = await invokeBridge<CommandResultDto>('execute_edit_command', {
      session_id: sessionId,
      command,
      base_revision: baseRevision,
      frontend_txn_id: frontendTxnId,
    });
    logDebug('bridge', 'executeEditCommand completed', {
      sessionId,
      revision: result.revision,
    });
    return result;
  } catch (err) {
    logException('bridge', 'executeEditCommand failed', err, {
      sessionId,
      commandType: command.type,
    });
    throw err;
  }
}

/** Undo the last edit(s) in a document session. */
export async function undoDocument(
  sessionId: number,
  frontendTxnId: string,
  maxSteps?: number,
  _options?: BridgeOptions,
): Promise<CommandResultDto> {
  logDebug('bridge', 'undoDocument', { sessionId, maxSteps });
  try {
    const result = await invokeBridge<CommandResultDto>('undo_document', {
      session_id: sessionId,
      frontend_txn_id: frontendTxnId,
      max_steps: maxSteps,
    });
    logDebug('bridge', 'undoDocument completed', {
      sessionId,
      revision: result.revision,
    });
    return result;
  } catch (err) {
    logException('bridge', 'undoDocument failed', err, { sessionId });
    throw err;
  }
}

/** Redo the last undone edit(s) in a document session. */
export async function redoDocument(
  sessionId: number,
  frontendTxnId: string,
  maxSteps?: number,
  _options?: BridgeOptions,
): Promise<CommandResultDto> {
  logDebug('bridge', 'redoDocument', { sessionId, maxSteps });
  try {
    const result = await invokeBridge<CommandResultDto>('redo_document', {
      session_id: sessionId,
      frontend_txn_id: frontendTxnId,
      max_steps: maxSteps,
    });
    logDebug('bridge', 'redoDocument completed', {
      sessionId,
      revision: result.revision,
    });
    return result;
  } catch (err) {
    logException('bridge', 'redoDocument failed', err, { sessionId });
    throw err;
  }
}
