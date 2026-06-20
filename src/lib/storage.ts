import { invoke } from '@tauri-apps/api/core';

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileEntry[];
}

export interface RemoteImageData {
  data: string;
  mimeType: string;
}

export async function readFile(path: string): Promise<string> {
  return invoke<string>('read_file', { path });
}

export async function writeFile(path: string, content: string): Promise<void> {
  return invoke('write_file', { path, content });
}

export async function saveMermaidSvgExport(svg: string, defaultName: string): Promise<boolean> {
  return invoke<boolean>('save_mermaid_svg_export', { svg, defaultName });
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

export async function readSingleDir(path: string): Promise<FileEntry[]> {
  return invoke<FileEntry[]>('read_single_dir', { path });
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

export async function readFileAsBase64(path: string): Promise<string> {
  return invoke<string>('read_file_as_base64', { path });
}

export async function writeFileFromBase64(path: string, data: string): Promise<void> {
  return invoke('write_file_from_base64', { path, data });
}

export async function saveMermaidPngExport(data: string, defaultName: string): Promise<boolean> {
  return invoke<boolean>('save_mermaid_png_export', { data, defaultName });
}

export async function saveImageExport(data: string, fileName: string, extension: string): Promise<boolean> {
  return invoke<boolean>('save_image_export', { data, fileName, extension });
}

export async function fetchRemoteImageAsBase64(url: string): Promise<RemoteImageData> {
  return invoke<RemoteImageData>('fetch_remote_image_as_base64', { url });
}

export async function fetchPageTitle(url: string): Promise<string> {
  return invoke<string>('fetch_page_title', { url });
}

export async function downloadImage(url: string, dest: string): Promise<string> {
  return invoke<string>('download_image', { url, dest });
}

export async function fileExists(path: string): Promise<boolean> {
  return invoke<boolean>('file_exists', { path });
}

export async function hasCliFile(): Promise<boolean> {
  return invoke<boolean>('has_cli_file');
}

export async function openFileInNewWindow(path: string): Promise<void> {
  return invoke('open_file_in_new_window', { path });
}

export async function addRecentFile(path: string): Promise<void> {
  return invoke('add_recent_file', { path });
}

export async function addRecentFolder(path: string): Promise<void> {
  return invoke('add_recent_folder', { path });
}

export async function clearRecentHistory(): Promise<void> {
  return invoke('clear_recent_history');
}
