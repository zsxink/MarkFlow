import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openShellTarget, validateShellOpenTarget } from './shell';

const mocks = vi.hoisted(() => ({
  shellOpen: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-shell', () => ({
  open: mocks.shellOpen,
}));

describe('Host shell bridge', () => {
  beforeEach(() => {
    mocks.shellOpen.mockReset();
  });

  it('opens an absolute local path with shell Host context', async () => {
    const result = await openShellTarget({
      target: '/Users/test/project',
      requestId: 'shell-1',
    });

    expect(mocks.shellOpen).toHaveBeenCalledWith('/Users/test/project');
    expect(result.context).toMatchObject({
      requestId: 'shell-1',
      clientId: 'default',
      windowLabel: 'main',
      capability: 'shell',
    });
  });

  it('allows file, http, and https URL schemes', () => {
    expect(validateShellOpenTarget('file:///tmp/report.pdf')).toBe('file:///tmp/report.pdf');
    expect(validateShellOpenTarget('https://example.com')).toBe('https://example.com');
    expect(validateShellOpenTarget('http://example.com')).toBe('http://example.com');
  });

  it('allows Windows absolute path forms', () => {
    expect(validateShellOpenTarget('C:\\Users\\test\\note.md')).toBe('C:\\Users\\test\\note.md');
    expect(validateShellOpenTarget('\\\\server\\share\\note.md')).toBe('\\\\server\\share\\note.md');
  });

  it('rejects relative paths and unsafe schemes', () => {
    expect(() => validateShellOpenTarget('relative/path')).toThrow('must be absolute');
    expect(() => validateShellOpenTarget('javascript:alert(1)')).toThrow('UNSUPPORTED_SCHEME');
    expect(() => validateShellOpenTarget('data:text/plain,test')).toThrow('UNSUPPORTED_SCHEME');
    expect(() => validateShellOpenTarget('   ')).toThrow('empty');
  });
});
