export interface HostResultIdentity {
  requestId?: string;
  clientId?: string;
  windowLabel?: string;
  sessionId?: number | string;
  documentId?: number | string;
  baseRevision?: number;
}

export class HostResultIdentityError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HostResultIdentityError';
  }
}

function normalizeId(value: number | string | undefined): string | undefined {
  return value === undefined ? undefined : String(value);
}

function reject(code: string, message: string): never {
  throw new HostResultIdentityError(code, `${code}: ${message}`);
}

export function assertHostResultIdentity(
  expected: HostResultIdentity,
  actual: HostResultIdentity,
): void {
  if (expected.requestId !== undefined && actual.requestId === undefined) {
    reject('HOST_REQUEST_MISMATCH', 'Host result is missing request id');
  }
  if (
    expected.requestId !== undefined &&
    actual.requestId !== undefined &&
    expected.requestId !== actual.requestId
  ) {
    reject('HOST_REQUEST_MISMATCH', 'Host result request id does not match the initiating operation');
  }
  if (expected.clientId !== undefined && actual.clientId === undefined) {
    reject('HOST_CLIENT_MISMATCH', 'Host result is missing client id');
  }
  if (
    expected.clientId !== undefined &&
    actual.clientId !== undefined &&
    expected.clientId !== actual.clientId
  ) {
    reject('HOST_CLIENT_MISMATCH', 'Host result client id does not match the initiating operation');
  }
  if (expected.windowLabel !== undefined && actual.windowLabel === undefined) {
    reject('HOST_WINDOW_MISMATCH', 'Host result is missing window label');
  }
  if (
    expected.windowLabel !== undefined &&
    actual.windowLabel !== undefined &&
    expected.windowLabel !== actual.windowLabel
  ) {
    reject('HOST_WINDOW_MISMATCH', 'Host result window does not match the initiating operation');
  }
  if (expected.sessionId !== undefined && actual.sessionId === undefined) {
    reject('HOST_STALE_SESSION', 'Host result is missing session id');
  }
  if (
    expected.sessionId !== undefined &&
    actual.sessionId !== undefined &&
    normalizeId(expected.sessionId) !== normalizeId(actual.sessionId)
  ) {
    reject('HOST_STALE_SESSION', 'Host result session does not match the initiating operation');
  }
  if (expected.documentId !== undefined && actual.documentId === undefined) {
    reject('HOST_SESSION_MISMATCH', 'Host result is missing document id');
  }
  if (
    expected.documentId !== undefined &&
    actual.documentId !== undefined &&
    normalizeId(expected.documentId) !== normalizeId(actual.documentId)
  ) {
    reject('HOST_SESSION_MISMATCH', 'Host result document does not match the initiating operation');
  }
  if (expected.baseRevision !== undefined && actual.baseRevision === undefined) {
    reject('HOST_STALE_REVISION', 'Host result is missing revision');
  }
  if (
    expected.baseRevision !== undefined &&
    actual.baseRevision !== undefined &&
    expected.baseRevision !== actual.baseRevision
  ) {
    reject('HOST_STALE_REVISION', 'Host result revision does not match the initiating operation');
  }
}
