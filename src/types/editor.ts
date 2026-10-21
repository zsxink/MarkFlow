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
