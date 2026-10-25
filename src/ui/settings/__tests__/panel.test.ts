import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loadSettings, open, saveSettings, setTheme, showModal, store } = vi.hoisted(() => ({
  loadSettings: vi.fn(), open: vi.fn(), saveSettings: vi.fn(), setTheme: vi.fn(), showModal: vi.fn(), store: { emit: vi.fn() },
}));
vi.mock('../../../infra/storage', () => ({ loadSettings, saveSettings }));
vi.mock('../../../infra/theme', () => ({ setTheme }));
vi.mock('../../../infra/logger', () => ({ logException: vi.fn() }));
vi.mock('../../../infra/store', () => ({ store }));
vi.mock('../../modal', () => ({ showModal }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open }));
import { showSettings } from '../panel';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
async function openSettingsPanel() {
  showSettings();
  if (!document.querySelector('.modal-settings')) showSettings();
  await flush();
}

beforeEach(() => {
  document.body.innerHTML = '<div id="sidebar"></div><textarea id="source-editor"></textarea>';
  vi.clearAllMocks();
  loadSettings.mockResolvedValue({ theme: 'dark', fontSize: 20, autosave: false, fileTreePageSize: 10, fileTreeAutoLoadDepth: 99 });
  showModal.mockImplementation(({ content }: { content: string }) => { document.body.insertAdjacentHTML('beforeend', content); return { hide: vi.fn() }; });
});

describe('settings panel', () => {
  it('hydrates controls from stored settings and applies runtime settings', async () => {
    await openSettingsPanel();
    expect(loadSettings).toHaveBeenCalledOnce();
    expect((document.getElementById('setting-fontsize') as HTMLSelectElement).value).toBe('20');
    expect(document.getElementById('setting-autosave')!.classList.contains('active')).toBe(false);
    expect(setTheme).toHaveBeenCalledWith('dark');
    expect((document.getElementById('source-editor') as HTMLTextAreaElement).style.fontSize).toBe('20px');
    const highlightGroup = document.getElementById('setting-codehighlight')!.closest('.settings-group');
    expect(highlightGroup?.querySelector('.settings-group-title')?.textContent).toBe('代码块');
    expect(document.getElementById('setting-plantuml-server-url')!.classList.contains('settings-input-full')).toBe(true);
    expect((document.getElementById('setting-image-storage') as HTMLSelectElement).value).toBe('custom');
    expect((document.getElementById('setting-image-custom-path') as HTMLInputElement).value).toBe('./images');
    expect(document.getElementById('setting-image-custom-row')!.hidden).toBe(false);
    expect(document.getElementById('setting-image-apply-local')!.classList.contains('active')).toBe(true);
    expect(document.getElementById('setting-image-apply-network')!.classList.contains('active')).toBe(true);
    expect((document.getElementById('setting-image-clipboard-template') as HTMLInputElement).value)
      .toBe('img-${date:yyyyMMdd}${time:HHmmss}');
    expect(document.querySelector('.settings-template-help')?.textContent).toContain('${filename}');
  });

  it('switches tabs and persists validated file-tree bounds', async () => {
    await openSettingsPanel();
    (document.querySelector('[data-panel="appearance"]') as HTMLElement).click();
    expect(document.getElementById('panel-appearance')!.hidden).toBe(false);
    expect(document.getElementById('panel-general')!.hidden).toBe(true);
    const pageSize = document.getElementById('setting-filetree-page-size') as HTMLInputElement;
    pageSize.value = '10'; pageSize.dispatchEvent(new Event('change'));
    await flush(); await flush();
    expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({ fileTreePageSize: 50, fileTreeAutoLoadDepth: 32 }));
    expect(store.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'settings:changed' }));
  });

  it('hydrates the unsupported-files toggle off by default and persists toggling it on', async () => {
    loadSettings.mockResolvedValue({});
    await openSettingsPanel();
    const toggle = document.getElementById('setting-filetree-show-unsupported')!;
    expect(toggle.classList.contains('active')).toBe(false);
    toggle.click();
    await flush(); await flush();
    expect(toggle.classList.contains('active')).toBe(true);
    expect(saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ fileBrowserShowUnsupportedFiles: true }));
  });

  it('hydrates the unsupported-files toggle from a stored true value', async () => {
    loadSettings.mockResolvedValue({ fileBrowserShowUnsupportedFiles: true });
    await openSettingsPanel();
    expect(document.getElementById('setting-filetree-show-unsupported')!.classList.contains('active')).toBe(true);
  });

  it('shows the path picker only for the custom storage mode', async () => {
    loadSettings.mockResolvedValue({
      imageStorageMode: 'document-named-dir',
      imageCustomPath: '/unused/path',
      imageApplyToLocal: false,
      imageApplyToNetwork: false,
      imageClipboardNameTemplate: '${filename}-${date:yyyy-MM-dd}',
    });

    await openSettingsPanel();

    const storage = document.getElementById('setting-image-storage') as HTMLSelectElement;
    const customRow = document.getElementById('setting-image-custom-row')!;
    const namedDirHelp = document.getElementById('setting-image-named-dir-help')!;
    expect([...storage.options].map(option => option.value)).toEqual([
      'custom', 'document-dir', 'document-named-dir',
    ]);
    expect(customRow.hidden).toBe(true);
    expect(namedDirHelp.hidden).toBe(false);
    expect(document.getElementById('setting-image-apply-local')!.classList.contains('active')).toBe(false);
    expect(document.getElementById('setting-image-apply-network')!.classList.contains('active')).toBe(false);

    storage.value = 'custom';
    storage.dispatchEvent(new Event('change'));
    await flush();

    expect(customRow.hidden).toBe(false);
    expect(namedDirHelp.hidden).toBe(true);
    expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({
      version: 3,
      imageStorageMode: 'custom',
      imageCustomPath: '/unused/path',
      imageApplyToLocal: false,
      imageApplyToNetwork: false,
      imageClipboardNameTemplate: '${filename}-${date:yyyy-MM-dd}',
    }));
  });

  it('uses ./images for an empty custom path and persists a selected folder', async () => {
    await openSettingsPanel();

    const customPath = document.getElementById('setting-image-custom-path') as HTMLInputElement;
    customPath.value = '   ';
    customPath.dispatchEvent(new Event('change'));
    await flush();
    expect(saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ imageCustomPath: './images' }));

    open.mockResolvedValue('/Users/example/Pictures');
    document.getElementById('setting-image-choose-folder')!.click();
    await flush();
    await flush();
    expect(customPath.value).toBe('/Users/example/Pictures');
    expect(saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({
      imageStorageMode: 'custom',
      imageCustomPath: '/Users/example/Pictures',
    }));
  });

  it('hydrates document-limit fields with KB conversion, defaulting missing fields', async () => {
    loadSettings.mockResolvedValue({
      wysiwygAdmissionBytes: 524288,
      wysiwygAdmissionLines: 2000,
      wysiwygMaxNodes: 3000,
      largeFileThreshold: 2097152,
      largeFileLineThreshold: 4000,
    });

    await openSettingsPanel();

    const valueOf = (id: string) => (document.getElementById(id) as HTMLInputElement).value;
    expect(valueOf('setting-wysiwyg-admission-kb')).toBe('512');
    expect(valueOf('setting-wysiwyg-admission-lines')).toBe('2000');
    expect(valueOf('setting-wysiwyg-max-nodes')).toBe('3000');
    // Missing fields (pre-upgrade settings) fall back to the documented defaults.
    expect(valueOf('setting-wysiwyg-max-text-length')).toBe('500000');
    expect(valueOf('setting-large-file-kb')).toBe('2048');
    expect(valueOf('setting-huge-file-kb')).toBe('10240');
    expect(valueOf('setting-large-file-lines')).toBe('4000');
    expect(valueOf('setting-huge-file-lines')).toBe('50000');
  });

  it('persists valid document-limit edits with KB→bytes conversion', async () => {
    await openSettingsPanel();

    const admissionKb = document.getElementById('setting-wysiwyg-admission-kb') as HTMLInputElement;
    admissionKb.value = '1024';
    admissionKb.dispatchEvent(new Event('change'));
    await flush();
    await flush();

    expect(saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ wysiwygAdmissionBytes: 1048576 }));
    expect(document.getElementById('setting-document-limits-error')!.hidden).toBe(true);
  });

  it('rejects large≥huge thresholds with an inline error and no write, then recovers', async () => {
    await openSettingsPanel();

    const largeKb = document.getElementById('setting-large-file-kb') as HTMLInputElement;
    largeKb.value = '20480'; // ≥ huge threshold (10240 KB)
    largeKb.dispatchEvent(new Event('change'));
    await flush();
    await flush();

    const error = document.getElementById('setting-document-limits-error')!;
    expect(error.hidden).toBe(false);
    expect(error.textContent).toContain('大文件体积阈值');
    expect(saveSettings).not.toHaveBeenCalled();
    expect(store.emit).not.toHaveBeenCalled();

    largeKb.value = '2048';
    largeKb.dispatchEvent(new Event('change'));
    await flush();
    await flush();

    expect(error.hidden).toBe(true);
    expect(saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ largeFileThreshold: 2097152 }));
  });

  it('rejects non-positive and out-of-tier admission values without writing', async () => {
    await openSettingsPanel();

    const lines = document.getElementById('setting-wysiwyg-admission-lines') as HTMLInputElement;
    lines.value = '0';
    lines.dispatchEvent(new Event('change'));
    await flush();
    await flush();

    const error = document.getElementById('setting-document-limits-error')!;
    expect(error.hidden).toBe(false);
    expect(error.textContent).toContain('大于 0');
    expect(saveSettings).not.toHaveBeenCalled();

    lines.value = '4000';
    const admissionKb = document.getElementById('setting-wysiwyg-admission-kb') as HTMLInputElement;
    admissionKb.value = '4096'; // above the large-file tier (1024 KB)
    admissionKb.dispatchEvent(new Event('change'));
    await flush();
    await flush();

    expect(error.hidden).toBe(false);
    expect(error.textContent).toContain('准入体积上限');
    expect(saveSettings).not.toHaveBeenCalled();
  });
});
