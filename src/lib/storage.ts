import type { DirectoryPage, FileEntry, FileMetadata, RemoteImageData } from '../types/fileTree';
import type { Settings } from '../types/settings';
import { DEFAULT_SETTINGS } from '../types/settings';
import { invoke } from '@tauri-apps/api/core';

export async function readFile(path: string): Promise<string> {
  return invoke<string>('read_file', { path });
}

export async function getFileMetadata(path: string): Promise<FileMetadata> {
  return invoke<FileMetadata>('file_metadata', { path });
}

export async function writeFile(path: string, content: string): Promise<void> {
  return invoke('write_file', { path, content });
}

export async function saveMermaidSvgExport(svg: string, defaultName: string): Promise<boolean> {
  return invoke<boolean>('save_mermaid_svg_export', { svg, defaultName });
}

export async function readDirPage(
  path: string,
  options: { cursor?: string | null; limit?: number; generation?: string | null } = {},
): Promise<DirectoryPage> {
  return invoke<DirectoryPage>('read_dir', {
    path,
    cursor: options.cursor ?? null,
    limit: options.limit ?? null,
    generation: options.generation ?? null,
  });
}

export async function readPathEntry(path: string): Promise<FileEntry> {
  return invoke<FileEntry>('read_path_entry', { path });
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

export async function loadSettings(): Promise<Settings> {
  if (settingsCache) return settingsCache;
  const s = await invoke('load_settings');
  settingsCache = s as Settings;
  return settingsCache;
}

export async function saveSettings(settings: Partial<Settings>): Promise<void> {
  const merged = { ...DEFAULT_SETTINGS, ...settingsCache, ...settings } as Settings;
  await invoke('save_settings', { settings: merged });
  settingsCache = merged;
}

export function clearSettingsCache(): void {
  settingsCache = null;
}

/** Returns the latest loaded settings without triggering I/O. */
export function getCachedSettings(): Settings {
  return settingsCache ?? DEFAULT_SETTINGS;
}

let settingsCache: Settings | null = null;

export async function readFileAsBase64(path: string): Promise<string> {
  return invoke<string>('read_file_as_base64', { path });
}

export async function writeFileFromBase64(path: string, data: string): Promise<void> {
  return invoke('write_file_from_base64', { path, data });
}

export async function writeImageToStorage(
  path: string,
  storageRoot: string,
  data: string,
  documentPath: string | null,
): Promise<void> {
  return invoke('write_image_to_storage', { path, storageRoot, data, documentPath });
}

export async function copyImageToStorageFile(
  from: string,
  to: string,
  storageRoot: string,
  documentPath: string | null,
): Promise<void> {
  return invoke('copy_image_to_storage', { from, to, storageRoot, documentPath });
}

export async function saveMermaidPngExport(data: string, defaultName: string): Promise<boolean> {
  return invoke<boolean>('save_mermaid_png_export', { data, defaultName });
}

export async function savePlantUmlSvgExport(svg: string, defaultName: string): Promise<boolean> {
  return invoke<boolean>('save_plantuml_svg_export', { svg, defaultName });
}

export async function savePlantUmlPngExport(data: string, defaultName: string): Promise<boolean> {
  return invoke<boolean>('save_plantuml_png_export', { data, defaultName });
}

export async function saveImageExport(data: string, fileName: string, extension: string): Promise<boolean> {
  return invoke<boolean>('save_image_export', { data, fileName, extension });
}

export async function saveDocumentExport(content: string, defaultName: string, filterName: string, extensions: string[]): Promise<boolean> {
  return invoke<boolean>('save_document_export', { content, defaultName, filterName, extensions });
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

export async function downloadImageToStorage(
  url: string,
  dest: string,
  storageRoot: string,
  useMimeExtension: boolean,
  documentPath: string | null,
): Promise<{ path: string; mimeType: string }> {
  return invoke('download_image_to_storage', {
    url,
    dest,
    storageRoot,
    useMimeExtension,
    documentPath,
  });
}

export interface PendingImage {
  draftId: string;
  path: string;
}

export interface PendingImageMapping {
  from: string;
  to: string;
}

export interface PendingImageMigration {
  draftId: string;
  mappings: PendingImageMapping[];
}

/** Write an image into MarkFlow's backend-owned per-draft data directory. */
export async function writePendingImage(
  fileName: string,
  data: string,
  draftId: string | null = null,
): Promise<PendingImage> {
  return invoke('write_pending_image', { draftId, fileName, data });
}

export async function copyImageToPending(
  fileName: string,
  from: string,
  draftId: string | null = null,
): Promise<PendingImage> {
  return invoke('copy_image_to_pending', { draftId, fileName, from });
}

export async function downloadImageToPending(
  fileName: string,
  url: string,
  draftId: string | null = null,
): Promise<PendingImage> {
  return invoke('download_image_to_pending', { draftId, fileName, url });
}

/** Copy all staged images to the storage target calculated by the backend. */
export async function migratePendingImages(
  draftId: string,
  documentPath: string,
): Promise<PendingImageMigration> {
  return invoke('migrate_pending_images', { draftId, documentPath });
}

export async function cleanupPendingImages(draftId: string): Promise<void> {
  return invoke('cleanup_pending_images', { draftId });
}

export async function cleanupExpiredPendingImages(
  recoverableDraftIds: string[] = [],
): Promise<number> {
  return invoke<number>('cleanup_expired_pending_images', { recoverableDraftIds });
}

/** Add the current image storage directory to Tauri's asset protocol scope. */
export async function authorizeImageStorage(documentPath: string): Promise<string> {
  return invoke<string>('authorize_image_storage', { documentPath });
}

export async function fileExists(path: string): Promise<boolean> {
  return invoke<boolean>('file_exists', { path });
}

export async function takeCliFile(): Promise<string | null> {
  return invoke<string | null>('take_cli_file');
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
