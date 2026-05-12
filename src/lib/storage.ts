import { invoke } from '@tauri-apps/api/core';

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileEntry[];
}

export async function readFile(path: string): Promise<string> {
  return invoke<string>('read_file', { path });
}

export async function writeFile(path: string, content: string): Promise<void> {
  return invoke('write_file', { path, content });
}

export async function readDirRecursive(path: string): Promise<FileEntry[]> {
  return invoke<FileEntry[]>('read_dir_recursive', { path });
}

export async function createFile(path: string, content?: string): Promise<void> {
  return invoke('create_file', { path, content });
}

export async function createDir(path: string): Promise<void> {
  return invoke('create_dir', { path });
}

export async function renamePath(from: string, to: string): Promise<void> {
  return invoke('rename_path', { from, to });
}

export async function deletePath(path: string): Promise<void> {
  return invoke('delete_path', { path });
}

export async function copyFile(from: string, to: string): Promise<void> {
  return invoke('copy_file', { from, to });
}

export async function setWorkspace(path: string): Promise<void> {
  return invoke('set_workspace', { path });
}

export async function getWorkspace(): Promise<string | null> {
  return invoke<string | null>('get_workspace');
}

export async function loadSettings(): Promise<Record<string, unknown>> {
  return invoke('load_settings');
}

export async function saveSettings(settings: Record<string, unknown>): Promise<void> {
  return invoke('save_settings', { settings });
}
