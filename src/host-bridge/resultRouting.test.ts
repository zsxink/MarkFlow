import { describe, expect, it } from 'vitest';

import { assertHostResultIdentity, HostResultIdentityError } from './resultRouting';

describe('assertHostResultIdentity', () => {
  it('accepts matching request, window, session, and revision identity', () => {
    expect(() => assertHostResultIdentity(
      {
        requestId: 'export-1',
        clientId: 'default',
        windowLabel: 'main',
        sessionId: 42,
        documentId: 9,
        baseRevision: 5,
      },
      {
        requestId: 'export-1',
        clientId: 'default',
        windowLabel: 'main',
        sessionId: '42',
        documentId: '9',
        baseRevision: 5,
      },
    )).not.toThrow();
  });

  it('rejects stale session results with a stable Host code', () => {
    expect(() => assertHostResultIdentity(
      { sessionId: 42 },
      { sessionId: 43 },
    )).toThrowError(HostResultIdentityError);
    try {
      assertHostResultIdentity({ sessionId: 42 }, { sessionId: 43 });
    } catch (error) {
      expect(error).toMatchObject({ code: 'HOST_STALE_SESSION' });
    }
  });

  it('rejects stale revision results with a stable Host code', () => {
    try {
      assertHostResultIdentity(
        { requestId: 'export-1', baseRevision: 5 },
        { requestId: 'export-1', baseRevision: 6 },
      );
    } catch (error) {
      expect(error).toMatchObject({ code: 'HOST_STALE_REVISION' });
    }
  });

  it('rejects window-routed results with a stable Host code', () => {
    try {
      assertHostResultIdentity(
        { windowLabel: 'main' },
        { windowLabel: 'settings' },
      );
    } catch (error) {
      expect(error).toMatchObject({ code: 'HOST_WINDOW_MISMATCH' });
    }
  });

  it('rejects missing required result identity', () => {
    try {
      assertHostResultIdentity(
        { requestId: 'export-1', sessionId: 42, baseRevision: 5 },
        { requestId: 'export-1', sessionId: 42 },
      );
    } catch (error) {
      expect(error).toMatchObject({ code: 'HOST_STALE_REVISION' });
    }
  });
});
