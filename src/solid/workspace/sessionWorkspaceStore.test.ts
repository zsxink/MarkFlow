import { describe, expect, it } from 'vitest';
import {
  createSessionProjection,
  createWorkspaceStore,
} from './sessionWorkspaceStore';

function makeSession(sessionId: string, path: string, revision = 1) {
  return createSessionProjection({
    sessionId,
    documentId: `doc-${sessionId}`,
    source: {
      kind: 'file',
      path,
      displayName: path.split('/').pop() ?? path,
    },
    confirmedRevision: revision,
    persistedRevision: revision,
  });
}

describe('createWorkspaceStore', () => {
  it('derives activeFilePath from the active session source', () => {
    const workspace = createWorkspaceStore({
      windowLabel: 'main',
      clientId: 'client-a',
      sessions: [makeSession('s1', '/docs/a.md'), makeSession('s2', '/docs/b.md')],
      activeSessionId: 's1',
    });

    expect(workspace.getActiveFilePath()).toBe('/docs/a.md');

    workspace.setActiveSession('s2');

    expect(workspace.getActiveFilePath()).toBe('/docs/b.md');
  });

  it('tracks window-scoped routing identity separately from sessions', () => {
    const workspace = createWorkspaceStore({
      windowLabel: 'main',
      clientId: 'client-a',
    });

    workspace.setWindowContext('editor-2', 'client-b');

    expect(workspace.state.windowLabel).toBe('editor-2');
    expect(workspace.state.clientId).toBe('client-b');
  });

  it('keeps dirty and revision projection isolated by sessionId', () => {
    const workspace = createWorkspaceStore({
      windowLabel: 'main',
      clientId: 'client-a',
      sessions: [makeSession('s1', '/docs/a.md'), makeSession('s2', '/docs/b.md')],
      activeSessionId: 's1',
    });

    workspace.updateSession('s2', {
      dirty: true,
      confirmedRevision: 8,
      pendingTransactionCount: 2,
    });

    expect(workspace.getSession('s1')?.dirty).toBe(false);
    expect(workspace.getSession('s1')?.confirmedRevision).toBe(1);
    expect(workspace.getSession('s2')?.dirty).toBe(true);
    expect(workspace.getSession('s2')?.confirmedRevision).toBe(8);
  });

  it('rejects stale async results before updating projection state', () => {
    const workspace = createWorkspaceStore({
      windowLabel: 'main',
      clientId: 'client-a',
      sessions: [makeSession('s1', '/docs/a.md', 4)],
      activeSessionId: 's1',
    });

    const applied = workspace.commitSessionResult(
      { sessionId: 's1', revision: 3, requestId: 'req-1' },
      'req-1',
      () => ({ dirty: true }),
    );

    expect(applied).toBe(false);
    expect(workspace.getSession('s1')?.dirty).toBe(false);
  });

  it('rejects stale async results with the wrong requestId', () => {
    const workspace = createWorkspaceStore({
      windowLabel: 'main',
      clientId: 'client-a',
      sessions: [makeSession('s1', '/docs/a.md', 4)],
      activeSessionId: 's1',
    });

    const applied = workspace.commitSessionResult(
      { sessionId: 's1', revision: 4, requestId: 'req-old' },
      'req-current',
      () => ({ dirty: true }),
    );

    expect(applied).toBe(false);
    expect(workspace.getSession('s1')?.dirty).toBe(false);
  });

  it('applies current async results to the matching session only', () => {
    const workspace = createWorkspaceStore({
      windowLabel: 'main',
      clientId: 'client-a',
      sessions: [makeSession('s1', '/docs/a.md', 5), makeSession('s2', '/docs/b.md', 5)],
      activeSessionId: 's1',
    });

    const applied = workspace.commitSessionResult(
      { sessionId: 's2', revision: 5, requestId: 'req-2' },
      'req-2',
      () => ({ viewport: { from: 10, to: 30, revision: 5 } }),
    );

    expect(applied).toBe(true);
    expect(workspace.getSession('s1')?.viewport).toBeNull();
    expect(workspace.getSession('s2')?.viewport).toEqual({ from: 10, to: 30, revision: 5 });
  });
});
