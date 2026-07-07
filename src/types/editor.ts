// ── Editor Mode ───────────────────────────────────────────────────────

export type EditorMode = 'wysiwyg' | 'source';

// ── Image Settings ────────────────────────────────────────────────────

export interface ImageSettings {
  storageMode: string;
  customPath: string;
  preferRelative: boolean;
  autoCopyLocal: boolean;
  downloadNetwork: boolean;
  namingStrategy: string;
}

// ── Cursor Position ───────────────────────────────────────────────────

export interface CursorPos {
  line: number;
  col: number;
}

// ── Document State ────────────────────────────────────────────────────

export interface DocumentState {
  path: string | null;
  dirty: boolean;
  wordCount: number;
  lineCount: number;
}
