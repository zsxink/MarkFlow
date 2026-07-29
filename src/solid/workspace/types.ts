import type { EditorMode } from '../../types/editor';

export type SessionId = string;
export type DocumentId = string;
export type SizeClass = 'normal' | 'large' | 'huge';

export interface DocumentSourceProjection {
  kind: 'file' | 'untitled';
  path: string | null;
  displayName: string;
  fingerprintHash?: string;
}

export interface SelectionState {
  anchor: number;
  head: number;
  revision: number;
}

export interface ViewportRange {
  from: number;
  to: number;
  revision: number;
}

export interface PanelState {
  sidebarTab: 'files' | 'outline';
  outlineVisible: boolean;
  diagnosticsVisible: boolean;
}

export interface SessionProjection {
  sessionId: SessionId;
  documentId: DocumentId;
  source: DocumentSourceProjection;
  mode: EditorMode | 'preview';
  confirmedRevision: number;
  persistedRevision: number;
  pendingTransactionCount: number;
  dirty: boolean;
  sizeClass: SizeClass;
  selection: SelectionState | null;
  viewport: ViewportRange | null;
  panels: PanelState;
}

export interface AppWorkspaceState {
  windowLabel: string;
  clientId: string;
  activeSessionId: SessionId | null;
  sessionsById: Record<SessionId, SessionProjection>;
}

export interface SessionScopedResult {
  sessionId: SessionId;
  revision: number;
  requestId: string;
}

