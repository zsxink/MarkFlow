// Centralized error classification so the UI can decide between retry,
// conflict resolution, degradation, or fatal exit — instead of guessing from
// a raw message or silently swallowing failures.

export type ErrorKind = 'retry' | 'conflict' | 'degrade' | 'fatal';

export interface ClassifiedError {
  kind: ErrorKind;
  code: string;
  message: string;
}

// Error shapes returned by the Tauri backend (`AppError`) or plain strings.
interface BackendErrorLike {
  code?: string;
  message?: string;
}

function toMessage(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const e = err as BackendErrorLike;
    return e.message ?? String(err);
  }
  return String(err);
}

function toCode(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as BackendErrorLike;
    if (e.code) return e.code;
  }
  return 'unknown';
}

// Map backend error codes (see src-tauri/src/error.rs) to UI actions.
const CODE_KIND: Record<string, ErrorKind> = {
  'lock-poisoned': 'fatal',
  'watcher-start-failed': 'degrade',
  'workspace-invalid': 'retry',
  io: 'retry',
  serialization: 'retry',
  internal: 'fatal',
};

export function classifyError(err: unknown): ClassifiedError {
  const code = toCode(err);
  const message = toMessage(err);
  const kind: ErrorKind = CODE_KIND[code] ?? inferKindFromMessage(message);
  return { kind, code, message };
}

// Fallback heuristic for plain-string errors (legacy commands / network).
function inferKindFromMessage(message: string): ErrorKind {
  const lower = message.toLowerCase();
  if (lower.includes('conflict') || lower.includes('external modification')) {
    return 'conflict';
  }
  if (lower.includes('not a directory') || lower.includes('invalid workspace')) {
    return 'retry';
  }
  if (lower.includes('permission') || lower.includes('denied') || lower.includes('network')) {
    return 'degrade';
  }
  return 'fatal';
}

// User-facing text per kind, so the UI surfaces a recoverable prompt rather
// than a bare toast or a silent drop.
const KIND_HINT: Record<ErrorKind, string> = {
  retry: '操作失败，请重试',
  conflict: '检测到冲突，请检查文件状态后重试',
  degrade: '操作受限（权限或网络），功能已降级',
  fatal: '操作失败',
};

/**
 * Report a failure from a user-initiated action. The error is classified and
 * surfaced with a kind-aware message. Use this instead of swallowing errors.
 */
export function reportUserActionError(scope: string, err: unknown): void {
  const classified = classifyError(err);
  const message = KIND_HINT[classified.kind];
  // Log structured context for diagnosis.
  // eslint-disable-next-line no-console
  console.warn(`[${scope}] ${classified.kind}/${classified.code}:`, classified.message);
  // showToast is injected lazily to avoid a circular import with the toast module.
  showToastMessage(`${message}（${classified.code}）`);
}

// Lazy import shim to avoid circular dependency with components/toast.
let showToastMessage: (msg: string) => void = (msg) => {
  // eslint-disable-next-line no-console
  console.warn(msg);
};
export function setToastReporter(fn: (msg: string) => void): void {
  showToastMessage = fn;
}

