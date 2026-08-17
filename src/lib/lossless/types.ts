// Lossless Core bridge DTO types — mirror `src-tauri/src/lossless/dto.rs`.
// Field names are camelCase (the Rust DTOs use `#[serde(rename_all = "camelCase")]`).

/** A SHA-256 content hash (hex). */
export type ContentHashHex = string;

export interface OriginalSnapshot {
  contentHash: ContentHashHex;
  byteLen: number;
  bom: 'none' | 'utf8';
  encoding: 'utf8' | 'utf8Bom';
  /** One EOL kind per logical \n boundary, in document order. */
  lineEndings: Array<'lf' | 'crlf' | 'cr'>;
  trailingLineBreaks: number;
  fileIdentity: FileIdentity;
  dominantLineEnding: 'lf' | 'crlf' | 'cr';
}

export interface FileIdentity {
  canonicalPath: string | null;
  size: number;
  mtime: number | null;
  contentHash: ContentHashHex;
}

/** `open_lossless_document` / `reload_lossless_document` */
export interface LosslessOpenResponse {
  sessionId: number;
  documentId: number;
  bindingGeneration: number;
  logicalText: string;
  revision: number;
  persistedRevision: number;
  confirmedHash: ContentHashHex;
  original: OriginalSnapshot;
}

/** One change in the base revision's UTF-16 coordinates (design 02 §3). */
export interface BridgeTextChange {
  fromUtf16: number;
  toUtf16: number;
  insertedLogicalText: string;
  insertedLineEndings: string[];
}

/** `apply_document_patch` — full identity matrix (design 02 §2). */
export interface BridgeTextPatch {
  bindingGeneration: number;
  sessionId: number;
  documentId: number;
  transactionId: number;
  baseRevision: number;
  changes: BridgeTextChange[];
  selectionAfter?: { anchorUtf16: number; headUtf16: number } | null;
}

/** Result of an applied patch. */
export interface PatchOutcome {
  revision: number;
  confirmedHash: ContentHashHex;
  selectionAfter?: { anchor: number; head: number; revision: number } | null;
}

/** `get_document_snapshot` */
export interface DocumentSnapshot {
  revision: number;
  logicalText: string;
  confirmedHash: ContentHashHex;
  persistedRevision: number | null;
  original: OriginalSnapshot;
}

/** `prepare_document_save` */
export interface PrepareSaveResponse {
  saveOperationId: string;
  sessionId: number;
  documentId: number;
  revision: number;
  payloadBase64: string;
  payloadSha256: ContentHashHex;
}

/** `guarded_atomic_write` */
export interface GuardedWriteResponse {
  saveOperationId: string;
  outcome: 'written' | 'conflict';
  newFileIdentity: FileIdentity | null;
  displacedIdentityMatched: boolean;
  receiptState: string;
}

/** `reconcile_document_save` */
export interface ReconcileResponse {
  saveOperationId: string;
  state: 'not-written' | 'written-and-commit-pending' | 'committed' | 'conflict';
  newFileIdentity: FileIdentity | null;
}

/** An unresolved durable save surfaced after startup; resolution is explicit. */
export interface StartupRecoveryItem {
  saveOperationId: string;
  path: string;
  state: string;
  sessionId: number;
  documentId: number;
  revision: number;
  payloadSha256: string;
  recoveryPath: string | null;
  /** Opaque/old-schema durable receipt: only an explicit quarantine action is safe. */
  requiresQuarantine: boolean;
}

/** `flush_document_session` */
export interface FlushResult {
  revision: number;
  confirmedHash: ContentHashHex;
  persistedRevision: number | null;
}

/** Structured bridge error: `{ code, message }`. Branch on `code` only. */
export interface LosslessError {
  code: string;
  message: string;
}
