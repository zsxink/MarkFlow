import { open as shellOpen } from '@tauri-apps/plugin-shell';
import { createShellHostRequestContext, type HostRequestContext } from './context';

const ALLOWED_URL_SCHEMES = new Set(['file:', 'http:', 'https:']);

export interface ShellOpenRequest {
  target: string;
  requestId?: string;
}

export interface ShellOpenResult {
  context: HostRequestContext;
  target: string;
}

export function validateShellOpenTarget(target: string): string {
  const normalized = target.trim();
  if (!normalized) {
    throw new Error('HOST_SHELL_INVALID_TARGET: shell target is empty');
  }

  if (
    normalized.startsWith('/')
    || normalized.startsWith('\\\\')
    || /^[a-zA-Z]:[\\/]/.test(normalized)
  ) {
    return normalized;
  }

  const schemeMatch = normalized.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  if (schemeMatch) {
    const scheme = `${schemeMatch[1].toLowerCase()}:`;
    if (!ALLOWED_URL_SCHEMES.has(scheme)) {
      throw new Error(`HOST_SHELL_UNSUPPORTED_SCHEME: ${scheme}`);
    }
    return normalized;
  }

  throw new Error('HOST_SHELL_INVALID_TARGET: shell target must be absolute');
}

export async function openShellTarget(request: ShellOpenRequest): Promise<ShellOpenResult> {
  const context = createShellHostRequestContext(request.requestId);
  const target = validateShellOpenTarget(request.target);
  await shellOpen(target);
  return { context, target };
}
