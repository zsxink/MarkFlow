import { describe, expect, it } from 'vitest';

import { classifyError } from './error';

describe('classifyError', () => {
  it('keeps Host/export stable codes distinguishable for UI handling', () => {
    expect(classifyError({ code: 'HOST_MISSING_CAPABILITY', message: 'missing' })).toMatchObject({
      code: 'HOST_MISSING_CAPABILITY',
      kind: 'degrade',
    });
    expect(classifyError({ code: 'HOST_PERMISSION_DENIED', message: 'denied' })).toMatchObject({
      code: 'HOST_PERMISSION_DENIED',
      kind: 'degrade',
    });
    expect(classifyError({ code: 'EXPORT_UNSUPPORTED_FORMAT', message: 'unsupported' })).toMatchObject({
      code: 'EXPORT_UNSUPPORTED_FORMAT',
      kind: 'degrade',
    });
    expect(classifyError({ code: 'EXPORT_TIMEOUT', message: 'timeout' })).toMatchObject({
      code: 'EXPORT_TIMEOUT',
      kind: 'retry',
    });
    expect(classifyError({ code: 'EXPORT_STALE_REVISION', message: 'stale' })).toMatchObject({
      code: 'EXPORT_STALE_REVISION',
      kind: 'retry',
    });
    expect(classifyError({ code: 'HOST_REQUEST_MISMATCH', message: 'request' })).toMatchObject({
      code: 'HOST_REQUEST_MISMATCH',
      kind: 'retry',
    });
    expect(classifyError({ code: 'HOST_CLIENT_MISMATCH', message: 'client' })).toMatchObject({
      code: 'HOST_CLIENT_MISMATCH',
      kind: 'retry',
    });
    expect(classifyError({ code: 'HOST_PROTOCOL_VERSION_UNSUPPORTED', message: 'version' })).toMatchObject({
      code: 'HOST_PROTOCOL_VERSION_UNSUPPORTED',
      kind: 'fatal',
    });
  });
});
