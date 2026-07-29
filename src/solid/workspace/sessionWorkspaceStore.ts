import { createStore } from 'solid-js/store';
import type {
  AppWorkspaceState,
  DocumentSourceProjection,
  PanelState,
  SessionId,
  SessionProjection,
  SessionScopedResult,
} from './types';

const DEFAULT_PANEL_STATE: PanelState = {
  sidebarTab: 'outline',
  outlineVisible: true,
  diagnosticsVisible: false,
};

export interface CreateSessionProjectionInput {
  sessionId: string;
  documentId: string;
  source: DocumentSourceProjection;
  mode?: SessionProjection['mode'];
  confirmedRevision?: number;
  persistedRevision?: number;
  pendingTransactionCount?: number;
  dirty?: boolean;
  sizeClass?: SessionProjection['sizeClass'];
  selection?: SessionProjection['selection'];
  viewport?: SessionProjection['viewport'];
  panels?: Partial<PanelState>;
}

export interface WorkspaceStoreOptions {
  windowLabel: string;
  clientId: string;
  activeSessionId?: SessionId | null;
  sessions?: SessionProjection[];
}

export function createSessionProjection(input: CreateSessionProjectionInput): SessionProjection {
  return {
    sessionId: input.sessionId,
    documentId: input.documentId,
    source: { ...input.source },
    mode: input.mode ?? 'wysiwyg',
    confirmedRevision: input.confirmedRevision ?? 0,
    persistedRevision: input.persistedRevision ?? 0,
    pendingTransactionCount: input.pendingTransactionCount ?? 0,
    dirty: input.dirty ?? false,
    sizeClass: input.sizeClass ?? 'normal',
    selection: input.selection ?? null,
    viewport: input.viewport ?? null,
    panels: { ...DEFAULT_PANEL_STATE, ...input.panels },
  };
}

export function createWorkspaceStore(options: WorkspaceStoreOptions) {
  const sessionsById = Object.fromEntries(
    (options.sessions ?? []).map((session) => [session.sessionId, session]),
  );
  const initialActiveSessionId = options.activeSessionId ?? null;

  const [state, setState] = createStore<AppWorkspaceState>({
    windowLabel: options.windowLabel,
    clientId: options.clientId,
    activeSessionId: initialActiveSessionId && sessionsById[initialActiveSessionId]
      ? initialActiveSessionId
      : null,
    sessionsById,
  });

  const getSession = (sessionId: SessionId): SessionProjection | null => (
    state.sessionsById[sessionId] ?? null
  );

  const getActiveSession = (): SessionProjection | null => (
    state.activeSessionId ? getSession(state.activeSessionId) : null
  );

  const getActiveFilePath = (): string | null => (
    getActiveSession()?.source.path ?? null
  );

  const setWindowContext = (windowLabel: string, clientId: string): void => {
    setState({
      windowLabel,
      clientId,
    });
  };

  const upsertSession = (session: SessionProjection, activate = false): void => {
    setState('sessionsById', session.sessionId, session);
    if (activate) {
      setState('activeSessionId', session.sessionId);
    }
  };

  const setActiveSession = (sessionId: SessionId | null): void => {
    if (sessionId !== null && !state.sessionsById[sessionId]) {
      throw new Error(`Cannot activate unknown session: ${sessionId}`);
    }
    setState('activeSessionId', sessionId);
  };

  const updateSession = (
    sessionId: SessionId,
    patch: Partial<Omit<SessionProjection, 'sessionId'>>,
  ): void => {
    if (!state.sessionsById[sessionId]) {
      throw new Error(`Cannot update unknown session: ${sessionId}`);
    }
    setState('sessionsById', sessionId, patch);
  };

  const removeSession = (sessionId: SessionId): void => {
    setState('sessionsById', Object.fromEntries(
      Object.entries(state.sessionsById).filter(([id]) => id !== sessionId),
    ));
    if (state.activeSessionId === sessionId) {
      setState('activeSessionId', null);
    }
  };

  const commitSessionResult = (
    result: SessionScopedResult,
    expectedRequestId: string,
    apply: (session: SessionProjection) => Partial<Omit<SessionProjection, 'sessionId'>>,
  ): boolean => {
    if (!expectedRequestId || result.requestId !== expectedRequestId) return false;
    const session = getSession(result.sessionId);
    if (!session || session.confirmedRevision !== result.revision) {
      return false;
    }
    updateSession(result.sessionId, apply(session));
    return true;
  };

  return {
    state,
    getSession,
    getActiveSession,
    getActiveFilePath,
    setWindowContext,
    upsertSession,
    setActiveSession,
    updateSession,
    removeSession,
    commitSessionResult,
  };
}

export const workspaceStore = createWorkspaceStore({
  windowLabel: 'main',
  clientId: 'legacy-window',
});
