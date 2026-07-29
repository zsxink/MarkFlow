export type HostCapability =
  | 'file'
  | 'dialog'
  | 'clipboard'
  | 'window'
  | 'notification'
  | 'shell'
  | 'export';

export interface HostRequestContext {
  clientId: string;
  windowLabel: string;
  sessionId?: string;
  documentId?: string;
  requestId: string;
  capability: HostCapability;
}

export interface CreateHostRequestContextInput {
  clientId: string;
  windowLabel: string;
  capability: HostCapability;
  sessionId?: string;
  documentId?: string;
  requestId?: string;
  documentScoped?: boolean;
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

  return {
    clientId: input.clientId,
    windowLabel: input.windowLabel,
    sessionId: input.sessionId,
    documentId: input.documentId,
    requestId: input.requestId ?? nextHostRequestId(),
    capability: input.capability,
  };
}

