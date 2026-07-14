import { beforeEach, describe, expect, it } from 'vitest';
import { createTreeNode, isSuppressedPath, suppressNextWatcherRefresh } from './fileTree.core';
import type { FileEntry } from '../types/fileTree';

beforeEach(() => {
  document.body.innerHTML = '';
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
