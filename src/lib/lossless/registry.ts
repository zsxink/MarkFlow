// Active lossless binding registry — P1B integration point.
//
// Tracks the single active `EditorSurfaceBinding` (one document = one binding).
// The legacy state (`editor.state.ts`) consults this registry so dirty /
// unpersisted-change checks and the save path route to the lossless Core
// session when one is active. Identity isolation (design 02 §2): a stale
// binding whose path no longer matches the active document is never consulted.

import { EditorSurfaceBinding } from './editorSurfaceBinding';

let activeBinding: EditorSurfaceBinding | null = null;
let activePath: string | null = null;

export function setActiveLosslessBinding(
  binding: EditorSurfaceBinding | null,
  path?: string | null,
): void {
  activeBinding = binding;
  activePath = binding ? (path ?? null) : null;
}

export function getActiveLosslessBinding(): EditorSurfaceBinding | null {
  return activeBinding;
}

/** True when `path` is the active lossless document. */
export function isActiveLosslessPath(path: string): boolean {
  return activeBinding !== null && activePath === path;
}

/** The active lossless binding's dirty state, or false when none/none-for-path. */
export function activeLosslessDirty(path?: string | null): boolean {
  if (!activeBinding) return false;
  if (path && activePath !== path) return false;
  return activeBinding.isDirty();
}

export function getActiveLosslessPath(): string | null {
  return activePath;
}

/** Update ownership after a verified Save As reconciliation/rebind. */
export function rebindActiveLosslessPath(binding: EditorSurfaceBinding, path: string): void {
  if (activeBinding !== binding) return;
  activePath = path;
}

/** Dispose the active binding (document close/switch). */
export async function disposeActiveLosslessBinding(): Promise<void> {
  const binding = activeBinding;
  activeBinding = null;
  activePath = null;
  if (binding) await binding.close();
}
