import { describe, expect, it } from 'vitest';
import { createHostRequestContext } from './context';

describe('createHostRequestContext', () => {
  it('preserves window and session routing fields', () => {
    expect(createHostRequestContext({
      clientId: 'client-a',
      windowLabel: 'main',
      capability: 'export',
      sessionId: 's1',
      documentId: 'd1',
      requestId: 'req-1',
      documentScoped: true,
    })).toEqual({
      clientId: 'client-a',
      windowLabel: 'main',
      capability: 'export',
      sessionId: 's1',
      documentId: 'd1',
      requestId: 'req-1',
    });
  });

  it('requires sessionId for document-scoped host effects', () => {
    expect(() => createHostRequestContext({
      clientId: 'client-a',
      windowLabel: 'main',
      capability: 'file',
      documentScoped: true,
    })).toThrow('requires sessionId');
  });
});

