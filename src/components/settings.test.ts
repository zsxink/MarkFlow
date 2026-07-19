import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loadSettings, saveSettings, setTheme, showModal, store } = vi.hoisted(() => ({
  loadSettings: vi.fn(), saveSettings: vi.fn(), setTheme: vi.fn(), showModal: vi.fn(), store: { emit: vi.fn() },
}));
vi.mock('../lib/storage', () => ({ loadSettings, saveSettings }));
vi.mock('../lib/theme', () => ({ setTheme }));
vi.mock('../lib/logger', () => ({ logException: vi.fn() }));
vi.mock('../lib/store', () => ({ store }));
vi.mock('./ui/modal', () => ({ showModal }));
import { showSettings } from './settings';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
beforeEach(() => {
  document.body.innerHTML = '<div id="sidebar"></div><textarea id="source-editor"></textarea>';
  vi.clearAllMocks();
  loadSettings.mockResolvedValue({ theme: 'dark', fontSize: 20, autosave: false, fileTreePageSize: 10, fileTreeAutoLoadDepth: 99 });
  showModal.mockImplementation(({ content }: { content: string }) => { document.body.insertAdjacentHTML('beforeend', content); return { hide: vi.fn() }; });
});

describe('settings panel', () => {
  it('hydrates controls from stored settings and applies runtime settings', async () => {
    showSettings(); await flush();
    expect(loadSettings).toHaveBeenCalledOnce();
    expect((document.getElementById('setting-fontsize') as HTMLSelectElement).value).toBe('20');
    expect(document.getElementById('setting-autosave')!.classList.contains('active')).toBe(false);
    expect(setTheme).toHaveBeenCalledWith('dark');
    expect((document.getElementById('source-editor') as HTMLTextAreaElement).style.fontSize).toBe('20px');
  });

  it('switches tabs and persists validated file-tree bounds', async () => {
    // The previous test leaves the module-level modal handle open; the first
    // call closes it and the second creates this test's panel.
    showSettings(); showSettings(); await flush();
    (document.querySelector('[data-panel="appearance"]') as HTMLElement).click();
    expect(document.getElementById('panel-appearance')!.hidden).toBe(false);
    expect(document.getElementById('panel-general')!.hidden).toBe(true);
    const pageSize = document.getElementById('setting-filetree-page-size') as HTMLInputElement;
    pageSize.value = '10'; pageSize.dispatchEvent(new Event('change'));
    await flush(); await flush();
    expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({ fileTreePageSize: 50, fileTreeAutoLoadDepth: 32 }));
    expect(store.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'settings:changed' }));
  });
});
