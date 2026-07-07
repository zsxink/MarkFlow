// ── File Entry ────────────────────────────────────────────────────────

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileEntry[];
}

// ── Remote Image Data ─────────────────────────────────────────────────

export interface RemoteImageData {
  data: string;
  mimeType: string;
}

// ── Drag State ────────────────────────────────────────────────────────

export interface DragState {
  srcPath: string | null;
  srcEl: HTMLElement | null;
  isDragging: boolean;
}
