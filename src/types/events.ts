import type { EditorMode } from './editor';
import type { Settings } from './settings';

// ── Store Events ──────────────────────────────────────────────────────

export type StoreEvent =
  | { type: 'editor:update' }
  | { type: 'editor:dirty'; dirty: boolean }
  | { type: 'editor:mode'; mode: EditorMode }
  | { type: 'file:active'; path: string | null }
  | { type: 'settings:changed'; settings: Settings }
  | { type: 'workspace:set'; path: string | null };

// ── Store State ───────────────────────────────────────────────────────

export interface StoreState {
  mode: EditorMode;
  activeFilePath: string | null;
  workspacePath: string | null;
  expandedPaths: string[];
  dirty: boolean;
  readOnly: boolean;
  settings: Settings;
}

// ── File System Events ────────────────────────────────────────────────

export interface FileChangeEvent {
  path: string;
  kind: string;
  timestamp: number;
}
