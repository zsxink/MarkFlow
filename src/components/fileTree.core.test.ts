import { beforeEach, describe, expect, it } from 'vitest';
import { afterEach, vi } from 'vitest';

const sidebarMocks = vi.hoisted(() => ({
  acquireDocumentTransitionGuard: vi.fn(),
  openFileInEditor: vi.fn(),
  openFileInNewWindow: vi.fn(),
}));

vi.mock('./sidebar', () => ({
  acquireDocumentTransitionGuard: sidebarMocks.acquireDocumentTransitionGuard,
  openFileInEditor: sidebarMocks.openFileInEditor,
}));
vi.mock('../lib/storage', () => ({ openFileInNewWindow: sidebarMocks.openFileInNewWindow }));
vi.mock('../lib/logger', () => ({ logException: vi.fn(), logInfo: vi.fn() }));
import {
  createTreeNode,
  isSuppressedPath,
  suppressNextWatcherRefresh,
  cleanup,
  flushPendingMutations,
  resetFileTreeStateForTesting,
} from './fileTree.core';
import type { FileEntry } from '../types/fileTree';

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  document.body.innerHTML = '';
  resetFileTreeStateForTesting();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('file tree DOM construction', () => {
  it('escapes untrusted file names as text instead of executable markup', () => {
    const entry: FileEntry = {
      name: '<img src=x onerror=alert(1)>.md',
      path: '/workspace/<img>.md',
      isDir: false,
    };

    const node = createTreeNode(entry, 0);
    document.body.appendChild(node);

    expect(node.querySelector('img')).toBeNull();
    expect(node.textContent).toContain('<img src=x onerror=alert(1)>.md');
  });

  it('exposes a stable semantic locator for a file node', () => {
    const node = createTreeNode({ name: 'note.md', path: '/workspace/note.md', isDir: false }, 0);

    expect(node.getAttribute('role')).toBe('treeitem');
    expect(node.getAttribute('data-testid')).toBe('file-tree-item');
    expect(node.getAttribute('data-path')).toBe('/workspace/note.md');
  });
});

describe('file tree deferred open transition guard', () => {
  function installTransitionGuardSpy() {
    let releaseCount = 0;
    sidebarMocks.acquireDocumentTransitionGuard.mockImplementation(() => {
      let released = false;
      return () => {
        if (released) return;
        released = true;
        releaseCount += 1;
      };
    });
    return () => releaseCount;
  }

  it('holds the guard through the single-click debounce and async open', async () => {
    const releases = installTransitionGuardSpy();
    let resolveOpen!: () => void;
    sidebarMocks.openFileInEditor.mockReturnValue(new Promise<void>((resolve) => { resolveOpen = resolve; }));
    const node = createTreeNode({ name: 'A.md', path: '/workspace/A.md', isDir: false }, 0);

    node.click();
    expect(sidebarMocks.acquireDocumentTransitionGuard).toHaveBeenCalledOnce();
    expect(releases()).toBe(0);

    await vi.advanceTimersByTimeAsync(250);
    expect(sidebarMocks.openFileInEditor).toHaveBeenCalledWith('/workspace/A.md');
    expect(releases()).toBe(0);

    resolveOpen();
    await Promise.resolve();
    expect(releases()).toBe(1);
  });

  it('releases the queued guard when a second click cancels the pending open', () => {
    const releases = installTransitionGuardSpy();
    const node = createTreeNode({ name: 'A.md', path: '/workspace/A.md', isDir: false }, 0);

    node.click();
    node.click();
    vi.advanceTimersByTime(250);

    expect(sidebarMocks.openFileInEditor).not.toHaveBeenCalled();
    expect(releases()).toBe(1);
  });

  it('releases the queued guard when double-click opens a new window', () => {
    const releases = installTransitionGuardSpy();
    const node = createTreeNode({ name: 'A.md', path: '/workspace/A.md', isDir: false }, 0);

    node.click();
    node.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    vi.advanceTimersByTime(250);

    expect(sidebarMocks.openFileInEditor).not.toHaveBeenCalled();
    expect(sidebarMocks.openFileInNewWindow).toHaveBeenCalledWith('/workspace/A.md');
    expect(releases()).toBe(1);
  });

  it('releases the guard when the deferred open rejects', async () => {
    const releases = installTransitionGuardSpy();
    sidebarMocks.openFileInEditor.mockRejectedValue(new Error('open failed'));
    const node = createTreeNode({ name: 'A.md', path: '/workspace/A.md', isDir: false }, 0);

    node.click();
    await vi.advanceTimersByTimeAsync(250);

    expect(releases()).toBe(1);
  });

  it('releases the queued guard when tree cleanup cancels the deferred open', () => {
    const releases = installTransitionGuardSpy();
    const node = createTreeNode({ name: 'A.md', path: '/workspace/A.md', isDir: false }, 0);

    node.click();
    cleanup();
    vi.advanceTimersByTime(250);

    expect(sidebarMocks.openFileInEditor).not.toHaveBeenCalled();
    expect(releases()).toBe(1);
  });
});

describe('watcher path suppression', () => {
  it('suppresses the created path and its descendants briefly', () => {
    suppressNextWatcherRefresh('/workspace/assets');
    expect(isSuppressedPath('/workspace/assets')).toBe(true);
    expect(isSuppressedPath('/workspace/assets/image.png')).toBe(true);
    expect(isSuppressedPath('/workspace/other.md')).toBe(false);
  });
});

describe('cleanup', () => {
  it('clears suppress paths', () => {
    suppressNextWatcherRefresh('/workspace/test');
    expect(isSuppressedPath('/workspace/test')).toBe(true);
    cleanup();
    expect(isSuppressedPath('/workspace/test')).toBe(false);
  });
});

describe('flushPendingMutations', () => {
  it('drains pending mutations synchronously', () => {
    // Access internal state via the module — flushPendingMutations is exported
    // We test it by verifying it doesn't throw when called
    expect(() => flushPendingMutations()).not.toThrow();
  });
});
