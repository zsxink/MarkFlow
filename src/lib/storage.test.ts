import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));

import * as storage from './storage';

beforeEach(() => {
  invoke.mockReset();
  storage.clearSettingsCache();
});

describe('storage IPC facade', () => {
  it('forwards file and directory operations with their command payloads', async () => {
    invoke.mockResolvedValueOnce('markdown').mockResolvedValueOnce({ entries: [] });
    await expect(storage.readFile('/a.md')).resolves.toBe('markdown');
    await storage.writeFile('/a.md', '# A');
    await storage.readDirPage('/work', { cursor: 'next', limit: 20, generation: 'g1' });
    await storage.renamePath('/a.md', '/b.md');
    await storage.deletePath('/b.md');

    expect(invoke).toHaveBeenNthCalledWith(1, 'read_file', { path: '/a.md' });
    expect(invoke).toHaveBeenNthCalledWith(2, 'write_file', { path: '/a.md', content: '# A' });
    expect(invoke).toHaveBeenNthCalledWith(3, 'read_dir', { path: '/work', cursor: 'next', limit: 20, generation: 'g1' });
    expect(invoke).toHaveBeenNthCalledWith(4, 'rename_path', { from: '/a.md', to: '/b.md' });
    expect(invoke).toHaveBeenNthCalledWith(5, 'delete_path', { path: '/b.md' });
  });

  it('uses null directory paging defaults and caches merged settings after saving', async () => {
    invoke.mockResolvedValue({ theme: 'dark', fontSize: 20 });
    await storage.readDirPage('/work');
    const loaded = await storage.loadSettings();
    await storage.saveSettings({ autosave: false });
    await storage.loadSettings();

    expect(invoke).toHaveBeenCalledWith('read_dir', { path: '/work', cursor: null, limit: null, generation: null });
    expect(loaded.theme).toBe('dark');
    expect(invoke).toHaveBeenCalledWith('save_settings', {
      settings: expect.objectContaining({ theme: 'dark', fontSize: 20, autosave: false }),
    });
    expect(invoke).toHaveBeenCalledTimes(3);
  });

  it('exposes image, export and recent-history commands', async () => {
    await storage.readFileAsBase64('/image.png');
    await storage.writeFileFromBase64('/image.png', 'data');
    await storage.saveDocumentExport('<p>x</p>', 'x.html', 'HTML', ['html']);
    await storage.addRecentFile('/a.md');
    await storage.clearRecentHistory();

    expect(invoke).toHaveBeenCalledWith('read_file_as_base64', { path: '/image.png' });
    expect(invoke).toHaveBeenCalledWith('write_file_from_base64', { path: '/image.png', data: 'data' });
    expect(invoke).toHaveBeenCalledWith('save_document_export', { content: '<p>x</p>', defaultName: 'x.html', filterName: 'HTML', extensions: ['html'] });
    expect(invoke).toHaveBeenCalledWith('add_recent_file', { path: '/a.md' });
    expect(invoke).toHaveBeenCalledWith('clear_recent_history');
  });
});
