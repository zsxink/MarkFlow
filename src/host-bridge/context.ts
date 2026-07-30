export type HostCapability =
  | 'file_system'
  | 'clipboard'
  | 'dialogs'
  | 'windows'
  | 'notifications'
  | 'shell'
  | 'network'
  | 'render'
  | 'export';

export const HOST_PROTOCOL_VERSION = 1;

export interface HostRequestContext {
  protocolVersion: number;
  requestId: string;
  clientId: string;
  windowLabel: string;
  sessionId?: string;
  documentId?: string;
  baseRevision?: number;
  capability: HostCapability;
}

export interface CreateHostRequestContextInput {
  clientId: string;
  windowLabel: string;
  capability: HostCapability;
  sessionId?: string;
  documentId?: string;
  baseRevision?: number;
  requestId?: string;
  documentScoped?: boolean;
  revisionScoped?: boolean;
}

let hostRequestId = 0;

function nextHostRequestId(): string {
  hostRequestId += 1;
  return `host_${Date.now()}_${hostRequestId}`;
}

export function createHostRequestContext(input: CreateHostRequestContextInput): HostRequestContext {
  if (input.documentScoped && !input.sessionId) {
    throw new Error(`Host capability ${input.capability} requires sessionId for document-scoped requests`);
  }
  if (input.revisionScoped && typeof input.baseRevision !== 'number') {
    throw new Error(`Host capability ${input.capability} requires baseRevision for revision-scoped requests`);
  }

  return {
    protocolVersion: HOST_PROTOCOL_VERSION,
    requestId: input.requestId ?? nextHostRequestId(),
    clientId: input.clientId,
    windowLabel: input.windowLabel,
    sessionId: input.sessionId,
    documentId: input.documentId,
    baseRevision: input.baseRevision,
    capability: input.capability,
  };
}

export function createClipboardHostRequestContext(requestId?: string): HostRequestContext {
  return createHostRequestContext({
    clientId: 'default',
    windowLabel: 'main',
    capability: 'clipboard',
    requestId,
  });
}

export function createShellHostRequestContext(requestId?: string): HostRequestContext {
  return createHostRequestContext({
    clientId: 'default',
    windowLabel: 'main',
    capability: 'shell',
    requestId,
  });
}

export function createNetworkHostRequestContext(input: {
  sessionId: number | string;
  documentId?: number | string;
  baseRevision: number;
  requestId?: string;
}): HostRequestContext {
  return createHostRequestContext({
    clientId: 'default',
    windowLabel: 'main',
    capability: 'network',
    sessionId: String(input.sessionId),
    documentId: input.documentId === undefined ? undefined : String(input.documentId),
    baseRevision: input.baseRevision,
    requestId: input.requestId,
    documentScoped: true,
    revisionScoped: true,
  });
}

export function createExportHostRequestContext(input: {
  sessionId: number | string;
  documentId?: number | string;
  baseRevision: number;
  requestId?: string;
}): HostRequestContext {
  return createHostRequestContext({
    clientId: 'default',
    windowLabel: 'main',
    capability: 'export',
    sessionId: String(input.sessionId),
    documentId: input.documentId === undefined ? undefined : String(input.documentId),
    baseRevision: input.baseRevision,
    requestId: input.requestId,
    documentScoped: true,
    revisionScoped: true,
  });
}
