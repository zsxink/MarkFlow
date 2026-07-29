import { afterEach, describe, expect, it } from 'vitest';
import { bootSolidShellIfEnabled, shouldBootSolidShell } from './bootstrap';

function envWithSolidFlag(value: string): ImportMetaEnv {
  return {
    BASE_URL: '/',
    MODE: 'test',
    DEV: true,
    PROD: false,
    SSR: false,
    VITE_MARKFLOW_SOLID_SHELL: value,
  };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Solid shell bootstrap', () => {
  it('is disabled unless the feature flag is set', () => {
    expect(shouldBootSolidShell(envWithSolidFlag('false'))).toBe(false);
    expect(shouldBootSolidShell(envWithSolidFlag('true'))).toBe(true);
    expect(shouldBootSolidShell(envWithSolidFlag('1'))).toBe(true);
  });

  it('does not mount into the legacy shell by default', () => {
    const dispose = bootSolidShellIfEnabled(document);

    expect(dispose).toBeNull();
    expect(document.getElementById('solid-shell-root')).toBeNull();
  });
});
