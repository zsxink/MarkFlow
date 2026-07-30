import { describe, expect, it } from 'vitest';
import {
  HOST_PROTOCOL_VERSION,
  createClipboardHostRequestContext,
  createExportHostRequestContext,
  createHostRequestContext,
  createNetworkHostRequestContext,
  createShellHostRequestContext,
} from './context';

describe('createHostRequestContext', () => {
  it('preserves window and session routing fields', () => {
    expect(createHostRequestContext({
      clientId: 'client-a',
      windowLabel: 'main',
      capability: 'export',
      sessionId: 's1',
      documentId: 'd1',
      baseRevision: 7,
      requestId: 'req-1',
      documentScoped: true,
      revisionScoped: true,
    })).toEqual({
      protocolVersion: HOST_PROTOCOL_VERSION,
      requestId: 'req-1',
      clientId: 'client-a',
      windowLabel: 'main',
      capability: 'export',
      sessionId: 's1',
      documentId: 'd1',
      baseRevision: 7,
    });
  });

  it('requires sessionId for document-scoped host effects', () => {
    expect(() => createHostRequestContext({
      clientId: 'client-a',
      windowLabel: 'main',
      capability: 'file_system',
      documentScoped: true,
    })).toThrow('requires sessionId');
  });

  it('requires baseRevision for revision-scoped host effects', () => {
    expect(() => createHostRequestContext({
      clientId: 'client-a',
      windowLabel: 'main',
      capability: 'export',
      sessionId: 's1',
      revisionScoped: true,
    })).toThrow('requires baseRevision');
  });

  it('creates window-scoped clipboard context', () => {
    expect(createClipboardHostRequestContext('clip-1')).toEqual({
      protocolVersion: HOST_PROTOCOL_VERSION,
      requestId: 'clip-1',
      clientId: 'default',
      windowLabel: 'main',
      capability: 'clipboard',
      sessionId: undefined,
      documentId: undefined,
      baseRevision: undefined,
    });
  });

  it('creates window-scoped shell context', () => {
    expect(createShellHostRequestContext('shell-1')).toEqual({
      protocolVersion: HOST_PROTOCOL_VERSION,
      requestId: 'shell-1',
      clientId: 'default',
      windowLabel: 'main',
      capability: 'shell',
      sessionId: undefined,
      documentId: undefined,
      baseRevision: undefined,
    });
  });

  it('creates session and revision-scoped network context', () => {
    expect(createNetworkHostRequestContext({
      requestId: 'net-1',
      sessionId: 42,
      documentId: 11,
      baseRevision: 7,
    })).toEqual({
      protocolVersion: HOST_PROTOCOL_VERSION,
      requestId: 'net-1',
      clientId: 'default',
      windowLabel: 'main',
      capability: 'network',
      sessionId: '42',
      documentId: '11',
      baseRevision: 7,
    });
  });

  it('creates session, revision, and window-scoped export context', () => {
    expect(createExportHostRequestContext({
      requestId: 'export-1',
      sessionId: 42,
      documentId: 11,
      baseRevision: 7,
    })).toEqual({
      protocolVersion: HOST_PROTOCOL_VERSION,
      requestId: 'export-1',
      clientId: 'default',
      windowLabel: 'main',
      capability: 'export',
      sessionId: '42',
      documentId: '11',
      baseRevision: 7,
    });
  });
});
