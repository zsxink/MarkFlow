import type { DirectoryLoadStatus, FileEntry } from '../types/fileTree';
import type { FileChangeEvent } from '../types/events';

export interface DirectoryState {
  status: DirectoryLoadStatus;
  children: string[];
  nextCursor: string | null;
  generation: string | null;
}

export interface FileTreeState {
  nodes: Map<string, FileEntry>;
  directories: Map<string, DirectoryState>;
}

export function normalizeTreePath(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
  return /^[A-Z]:/i.test(normalized) ? normalized[0].toLowerCase() + normalized.slice(1) : normalized;
}

export function createFileTreeState(): FileTreeState {
  return { nodes: new Map(), directories: new Map() };
}

export function compareEntries(a: FileEntry, b: FileEntry): number {
  if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
  return a.name.localeCompare(b.name) || normalizeTreePath(a.path).localeCompare(normalizeTreePath(b.path));
}

export function mergeDirectoryPage(
  state: FileTreeState,
  directoryPath: string,
  entries: FileEntry[],
  page: { nextCursor: string | null; generation: string; append: boolean },
): FileTreeState {
  const directory = normalizeTreePath(directoryPath);
  const nodes = new Map(state.nodes);
  const directories = new Map(state.directories);
  const previous = directories.get(directory);
  const paths = page.append ? [...(previous?.children ?? [])] : [];
  for (const entry of entries) {
    const path = normalizeTreePath(entry.path);
    nodes.set(path, { ...entry, path });
    if (!paths.includes(path)) paths.push(path);
    if (entry.isDir && !directories.has(path)) {
      directories.set(path, { status: 'unloaded', children: [], nextCursor: null, generation: null });
    }
  }
  paths.sort((a, b) => compareEntries(nodes.get(a)!, nodes.get(b)!));
  directories.set(directory, {
    status: 'loaded', children: paths, nextCursor: page.nextCursor, generation: page.generation,
  });
  return { nodes, directories };
}

export function markDirectoryState(state: FileTreeState, path: string, status: DirectoryLoadStatus): FileTreeState {
  const key = normalizeTreePath(path);
  const directories = new Map(state.directories);
  const current = directories.get(key) ?? { children: [], nextCursor: null, generation: null, status: 'unloaded' as const };
  directories.set(key, { ...current, status });
  return { nodes: new Map(state.nodes), directories };
}

export function applyTreeEvent(state: FileTreeState, event: FileChangeEvent): FileTreeState {
  const path = normalizeTreePath(event.path);
  if (event.kind === 'rescan') return markDirectoryState(state, path, 'stale');
  if (event.kind === 'rename' && event.toPath) return renameTreePath(state, path, event.toPath);
  const parent = path.slice(0, path.lastIndexOf('/'));
  const directory = state.directories.get(parent);
  if (!directory || directory.status === 'unloaded') return markDirectoryState(state, parent, 'stale');
  if (event.kind === 'delete') {
    const nodes = new Map(state.nodes);
    const directories = new Map(state.directories);
    for (const key of [...nodes.keys()]) if (key === path || key.startsWith(path + '/')) nodes.delete(key);
    for (const key of [...directories.keys()]) if (key === path || key.startsWith(path + '/')) directories.delete(key);
    directories.set(parent, { ...directory, children: directory.children.filter(child => child !== path) });
    return { nodes, directories };
  }
  return state;
}

export function upsertTreeEntry(state: FileTreeState, parentPath: string, entry: FileEntry): FileTreeState {
  const parent = normalizeTreePath(parentPath);
  const path = normalizeTreePath(entry.path);
  const nodes = new Map(state.nodes);
  const directories = new Map(state.directories);
  nodes.set(path, { ...entry, path });
  const directory = directories.get(parent);
  if (directory) {
    const children = [...new Set([...directory.children, path])];
    children.sort((a, b) => compareEntries(nodes.get(a)!, nodes.get(b)!));
    directories.set(parent, { ...directory, children });
  }
  if (entry.isDir && !directories.has(path)) directories.set(path, { status: 'unloaded', children: [], nextCursor: null, generation: null });
  return { nodes, directories };
}

export function renameTreePath(state: FileTreeState, from: string, to: string): FileTreeState {
  from = normalizeTreePath(from); to = normalizeTreePath(to);
  const nodes = new Map<string, FileEntry>();
  for (const [key, entry] of state.nodes) {
    const next = key === from || key.startsWith(from + '/') ? to + key.slice(from.length) : key;
    nodes.set(next, next === key ? entry : { ...entry, path: next, name: next.slice(next.lastIndexOf('/') + 1) });
  }
  const directories = new Map<string, DirectoryState>();
  for (const [key, directory] of state.directories) {
    const next = key === from || key.startsWith(from + '/') ? to + key.slice(from.length) : key;
    directories.set(next, { ...directory, children: directory.children.map(child => child === from || child.startsWith(from + '/') ? to + child.slice(from.length) : child) });
  }
  const oldParent = from.slice(0, from.lastIndexOf('/'));
  const newParent = to.slice(0, to.lastIndexOf('/'));
  if (oldParent !== newParent) {
    const oldDirectory = directories.get(oldParent);
    if (oldDirectory) directories.set(oldParent, { ...oldDirectory, children: oldDirectory.children.filter(child => child !== to) });
    const newDirectory = directories.get(newParent);
    if (newDirectory) {
      const children = [...new Set([...newDirectory.children, to])];
      children.sort((a, b) => compareEntries(nodes.get(a)!, nodes.get(b)!));
      directories.set(newParent, { ...newDirectory, children });
    }
  }
  for (const parent of new Set([oldParent, newParent])) {
    const directory = directories.get(parent);
    if (directory) {
      const children = [...directory.children];
      children.sort((a, b) => compareEntries(nodes.get(a)!, nodes.get(b)!));
      directories.set(parent, { ...directory, children });
    }
  }
  return { nodes, directories };
}
