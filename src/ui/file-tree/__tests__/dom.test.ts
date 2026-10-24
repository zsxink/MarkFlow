import { beforeEach, describe, expect, it } from 'vitest';
import { findChildrenContainer, insertSorted } from '../dom';
import { createTreeNode, insertEntryIntoTree } from '../render';
import { store } from '../../../infra/store';

beforeEach(() => {
  document.body.innerHTML = '';
});

function mountTreeRoot(): HTMLElement {
  const root = document.createElement('nav');
  root.id = 'file-tree';
  document.body.appendChild(root);
  return root;
}

function folderWrapper(name: string): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'tree-folder-wrapper';
  const folder = document.createElement('div');
  folder.className = 'tree-folder';
  folder.dataset.path = `/ws/${name}`;
  const label = document.createElement('span');
  label.textContent = name;
  folder.appendChild(label);
  const children = document.createElement('div');
  children.className = 'tree-children';
  wrapper.appendChild(folder);
  wrapper.appendChild(children);
  return wrapper;
}

function fileNode(name: string): HTMLElement {
  const file = document.createElement('div');
  file.className = 'tree-file';
  file.dataset.path = `/ws/${name}`;
  const label = document.createElement('span');
  label.textContent = name;
  file.appendChild(label);
  return file;
}

function loadMoreButton(): HTMLElement {
  const button = document.createElement('button');
  button.className = 'tree-load-more';
  button.textContent = '继续加载';
  return button;
}

/** Visible labels of a container's children, folders resolved through the wrapper. */
function childNames(container: HTMLElement): string[] {
  return Array.from(container.children).map(child => {
    if (child.classList.contains('tree-load-more')) return '(load-more)';
    const span = child.querySelector(':scope > span, :scope > .tree-folder > span') as HTMLElement | null;
    return span?.textContent || '';
  });
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

describe('insertSorted', () => {
  it('inserts a folder sorting after every folder before the first file node', () => {
    // Issue #419: the folder used to fall through to appendChild and land
    // below all files because the loop skipped them without an anchor.
    const root = mountTreeRoot();
    root.appendChild(folderWrapper('archive'));
    root.appendChild(folderWrapper('notes'));
    root.appendChild(fileNode('a.md'));
    root.appendChild(fileNode('b.md'));

    insertSorted(root, folderWrapper('测试'), true);

    expect(childNames(root)).toEqual(['archive', 'notes', '测试', 'a.md', 'b.md']);
  });

  it('appends a file sorting after every file at the end of the file section', () => {
    const root = mountTreeRoot();
    root.appendChild(folderWrapper('archive'));
    root.appendChild(fileNode('a.md'));
    root.appendChild(fileNode('b.md'));

    const node = fileNode('zz.md');
    insertSorted(root, node, false);

    expect(childNames(root)).toEqual(['archive', 'a.md', 'b.md', 'zz.md']);
    expect(root.lastElementChild).toBe(node);
  });

  it('keeps a file that sorts after every file before the load-more button', () => {
    const root = mountTreeRoot();
    root.appendChild(folderWrapper('archive'));
    root.appendChild(fileNode('a.md'));
    root.appendChild(fileNode('b.md'));
    root.appendChild(loadMoreButton());

    const node = fileNode('zz.md');
    insertSorted(root, node, false);

    expect(childNames(root)).toEqual(['archive', 'a.md', 'b.md', 'zz.md', '(load-more)']);
    expect(node.nextElementSibling).toBe(root.querySelector('.tree-load-more'));
  });

  it('keeps a folder that sorts after every folder above files and the load-more button', () => {
    const root = mountTreeRoot();
    root.appendChild(folderWrapper('archive'));
    root.appendChild(fileNode('a.md'));
    root.appendChild(loadMoreButton());

    insertSorted(root, folderWrapper('测试'), true);

    expect(childNames(root)).toEqual(['archive', '测试', 'a.md', '(load-more)']);
  });

  it('inserts the newcomer before an existing same-named sibling', () => {
    const root = mountTreeRoot();
    const existing = fileNode('a.md');
    root.appendChild(existing);
    root.appendChild(fileNode('b.md'));

    const node = fileNode('a.md');
    insertSorted(root, node, false);

    expect(node.nextElementSibling).toBe(existing);
    expect(childNames(root)).toEqual(['a.md', 'a.md', 'b.md']);
  });
});

describe('insertEntryIntoTree', () => {
  beforeEach(() => {
    document.body.innerHTML = '<nav id="file-tree"></nav>';
    store.setState({ workspacePath: '/ws' });
  });

  it('inserts a created folder after every folder and above every file', () => {
    const root = document.getElementById('file-tree')!;
    root.appendChild(createTreeNode({ name: 'archive', path: '/ws/archive', isDir: true }, 0));
    root.appendChild(createTreeNode({ name: 'notes', path: '/ws/notes', isDir: true }, 0));
    root.appendChild(createTreeNode({ name: 'a.md', path: '/ws/a.md', isDir: false }, 0));
    root.appendChild(createTreeNode({ name: 'b.md', path: '/ws/b.md', isDir: false }, 0));

    insertEntryIntoTree('/ws', { name: '测试', path: '/ws/测试', isDir: true });

    expect(childNames(root)).toEqual(['archive', 'notes', '测试', 'a.md', 'b.md']);
    expect(root.children[2].querySelector('.tree-folder')?.getAttribute('data-path')).toBe('/ws/测试');
  });

  it('inserts a created file before the load-more button when it sorts last', () => {
    // A paginated directory still shows its button; a watcher-created file
    // must not be appended behind it.
    const root = document.getElementById('file-tree')!;
    root.appendChild(createTreeNode({ name: 'archive', path: '/ws/archive', isDir: true }, 0));
    root.appendChild(createTreeNode({ name: 'a.md', path: '/ws/a.md', isDir: false }, 0));
    root.appendChild(loadMoreButton());

    insertEntryIntoTree('/ws', { name: 'zz.md', path: '/ws/zz.md', isDir: false });

    expect(childNames(root)).toEqual(['archive', 'a.md', 'zz.md', '(load-more)']);
  });

  it('skips the insert when an entry for the path is already rendered', () => {
    const root = document.getElementById('file-tree')!;
    root.appendChild(createTreeNode({ name: 'a.md', path: '/ws/a.md', isDir: false }, 0));

    insertEntryIntoTree('/ws', { name: 'a.md', path: '/ws/a.md', isDir: false });

    expect(root.children).toHaveLength(1);
  });
});
