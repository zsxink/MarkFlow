import { beforeEach, describe, expect, it } from 'vitest';
import { findChildrenContainer } from '../dom';

beforeEach(() => {
  document.body.innerHTML = '';
});

function mountTreeRoot(): HTMLElement {
  const root = document.createElement('nav');
  root.id = 'file-tree';
  document.body.appendChild(root);
  return root;
}

describe('findChildrenContainer', () => {
  it('returns the tree root for the workspace path itself', () => {
    const root = mountTreeRoot();
    expect(findChildrenContainer('/ws', '/ws')).toBe(root);
  });

  it('returns the tree root when only the Windows drive case differs', () => {
    // The tree keys every node with a lower-cased drive letter, so a persisted
    // workspace root still spelled `C:/…` must not make the root render vanish.
    const root = mountTreeRoot();
    expect(findChildrenContainer('C:/Notes', 'c:/Notes')).toBe(root);
    expect(findChildrenContainer('c:/Notes', 'C:/Notes')).toBe(root);
  });

  it('returns the tree root when separators and trailing slashes differ', () => {
    const root = mountTreeRoot();
    expect(findChildrenContainer('c:/Notes', 'C:\\Notes\\')).toBe(root);
  });

  it('finds a nested folder children container by exact path', () => {
    const root = mountTreeRoot();
    const wrapper = document.createElement('div');
    wrapper.className = 'tree-folder-wrapper';
    const folder = document.createElement('div');
    folder.className = 'tree-folder';
    folder.dataset.path = '/ws/sub';
    const children = document.createElement('div');
    children.className = 'tree-children';
    wrapper.appendChild(folder);
    wrapper.appendChild(children);
    root.appendChild(wrapper);

    expect(findChildrenContainer('/ws/sub', '/ws')).toBe(children);
  });

  it('returns null for a directory that is not rendered yet', () => {
    mountTreeRoot();
    expect(findChildrenContainer('/ws/missing', '/ws')).toBeNull();
  });

  it('returns null without a workspace path', () => {
    mountTreeRoot();
    expect(findChildrenContainer('/ws', null)).toBeNull();
  });
});
