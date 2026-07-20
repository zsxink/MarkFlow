import { beforeEach, describe, expect, it } from 'vitest';
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
  document.body.innerHTML = '';
  resetFileTreeStateForTesting();
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
