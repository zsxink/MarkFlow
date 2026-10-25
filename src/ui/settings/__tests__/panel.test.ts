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
  loadSettings.mockResolvedValue({ theme: 'dark', fontSize: 20, autosave: false, fileTreePageSize: 500, fileTreeAutoLoadDepth: 8 });
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

  it('switches tabs and rejects invalid file-tree bounds', async () => {
    await openSettingsPanel();
    (document.querySelector('[data-panel="appearance"]') as HTMLElement).click();
    expect(document.getElementById('panel-appearance')!.hidden).toBe(false);
    expect(document.getElementById('panel-general')!.hidden).toBe(true);
    const pageSize = document.getElementById('setting-filetree-page-size') as HTMLInputElement;
    pageSize.value = '10'; pageSize.dispatchEvent(new Event('change'));
    await flush(); await flush();
    expect(saveSettings).not.toHaveBeenCalled();
    expect(pageSize.getAttribute('aria-invalid')).toBe('true');
    pageSize.value = '50'; pageSize.dispatchEvent(new Event('change'));
    await flush(); await flush();
    expect(saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ fileTreePageSize: 50 }));
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

  it('hydrates document-limit fields with unit display, defaulting missing fields', async () => {
    loadSettings.mockResolvedValue({
      wysiwygMaxBytes: 524288,
      sourceMaxBytes: 2097152,
    });

    await openSettingsPanel();

    const valueOf = (id: string) => (document.getElementById(id) as HTMLInputElement).value;
    // KB-sized values display as KB; whole-MB values display as MB.
    expect(valueOf('setting-wysiwyg-max-size')).toBe('512');
    expect((document.getElementById('setting-wysiwyg-max-size-unit') as HTMLSelectElement).value).toBe('KB');
    expect(valueOf('setting-source-max-size')).toBe('2');
    expect((document.getElementById('setting-source-max-size-unit') as HTMLSelectElement).value).toBe('MB');
    // Missing fields (pre-upgrade settings) fall back to the documented defaults.
    expect(valueOf('setting-max-lines')).toBe('1000000');
  });

  it('hydrates the document-limit defaults (1MB / 10MB / 1,000,000 lines)', async () => {
    loadSettings.mockResolvedValue({});

    await openSettingsPanel();

    const valueOf = (id: string) => (document.getElementById(id) as HTMLInputElement).value;
    expect(valueOf('setting-wysiwyg-max-size')).toBe('1');
    expect((document.getElementById('setting-wysiwyg-max-size-unit') as HTMLSelectElement).value).toBe('MB');
    expect(valueOf('setting-source-max-size')).toBe('10');
    expect((document.getElementById('setting-source-max-size-unit') as HTMLSelectElement).value).toBe('MB');
    expect(valueOf('setting-max-lines')).toBe('1000000');
  });

  it('persists valid document-limit edits with unit→bytes conversion', async () => {
    await openSettingsPanel();

    const wysiwygSize = document.getElementById('setting-wysiwyg-max-size') as HTMLInputElement;
    wysiwygSize.value = '2';
    wysiwygSize.dispatchEvent(new Event('change'));
    await flush();
    await flush();

    expect(saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ wysiwygMaxBytes: 2097152 }));
    expect(document.getElementById('setting-document-limits-error')!.hidden).toBe(true);

    // A KB-unit edit converts with the selected unit, not a hardcoded one.
    const sourceSize = document.getElementById('setting-source-max-size') as HTMLInputElement;
    const sourceUnit = document.getElementById('setting-source-max-size-unit') as HTMLSelectElement;
    sourceUnit.value = 'KB';
    sourceSize.value = '5120';
    sourceSize.dispatchEvent(new Event('change'));
    await flush();
    await flush();

    expect(saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ sourceMaxBytes: 5242880 }));

    const maxLines = document.getElementById('setting-max-lines') as HTMLInputElement;
    maxLines.value = '500000';
    maxLines.dispatchEvent(new Event('change'));
    await flush();
    await flush();

    expect(saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ maxLines: 500000 }));
  });

  it('switching the unit re-expresses the same byte size instead of reinterpreting the number', async () => {
    await openSettingsPanel();

    const size = document.getElementById('setting-wysiwyg-max-size') as HTMLInputElement;
    const unit = document.getElementById('setting-wysiwyg-max-size-unit') as HTMLSelectElement;
    expect(size.value).toBe('1');
    expect(unit.value).toBe('MB');

    unit.value = 'KB';
    unit.dispatchEvent(new Event('change'));
    await flush();
    await flush();

    // 1 MB becomes 1024 KB, and the persisted byte size is unchanged.
    expect(size.value).toBe('1024');
    expect(saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ wysiwygMaxBytes: 1048576 }));
  });

  it('rejects wysiwyg > source sizes with an inline error and no write, then recovers', async () => {
    await openSettingsPanel();

    const wysiwygSize = document.getElementById('setting-wysiwyg-max-size') as HTMLInputElement;
    wysiwygSize.value = '20'; // MB — above the source default (10 MB)
    wysiwygSize.dispatchEvent(new Event('change'));
    await flush();
    await flush();

    const error = document.getElementById('setting-document-limits-error')!;
    expect(error.hidden).toBe(false);
    expect(error.textContent).toContain('所见即所得文档大小');
    expect(saveSettings).not.toHaveBeenCalled();
    expect(store.emit).not.toHaveBeenCalled();

    wysiwygSize.value = '2';
    wysiwygSize.dispatchEvent(new Event('change'));
    await flush();
    await flush();

    expect(error.hidden).toBe(true);
    expect(saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ wysiwygMaxBytes: 2097152 }));
  });

  it('rejects positive size values that round down below one persisted byte', async () => {
    await openSettingsPanel();
    const wysiwygSize = document.getElementById('setting-wysiwyg-max-size') as HTMLInputElement;
    const unit = document.getElementById('setting-wysiwyg-max-size-unit') as HTMLSelectElement;
    unit.value = 'KB';
    unit.dispatchEvent(new Event('change'));
    await flush(); await flush();
    vi.clearAllMocks();
    wysiwygSize.value = '0.000001';
    wysiwygSize.dispatchEvent(new Event('change'));
    await flush(); await flush();

    expect(document.getElementById('setting-document-limits-error')?.textContent).toContain('至少为 1 字节');
    expect(wysiwygSize.getAttribute('aria-invalid')).toBe('true');
    expect((document.getElementById('setting-source-max-size') as HTMLInputElement).getAttribute('aria-invalid')).toBeNull();
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it('accepts equal wysiwyg and source sizes (empty large band is a legal choice)', async () => {
    await openSettingsPanel();

    const wysiwygSize = document.getElementById('setting-wysiwyg-max-size') as HTMLInputElement;
    wysiwygSize.value = '10'; // MB — equal to the source default
    wysiwygSize.dispatchEvent(new Event('change'));
    await flush();
    await flush();

    expect(document.getElementById('setting-document-limits-error')!.hidden).toBe(true);
    expect(saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ wysiwygMaxBytes: 10485760 }));
  });

  it('rejects non-positive values without writing', async () => {
    await openSettingsPanel();

    const maxLines = document.getElementById('setting-max-lines') as HTMLInputElement;
    maxLines.value = '0';
    maxLines.dispatchEvent(new Event('change'));
    await flush();
    await flush();

    const error = document.getElementById('setting-document-limits-error')!;
    expect(error.hidden).toBe(false);
    expect(error.textContent).toContain('大于 0');
    expect(saveSettings).not.toHaveBeenCalled();

    maxLines.value = '-1';
    maxLines.dispatchEvent(new Event('change'));
    await flush();
    await flush();

    expect(error.hidden).toBe(false);
    expect(error.textContent).toContain('大于 0');
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it('strips legacy document-limit keys from the persisted settings', async () => {
    loadSettings.mockResolvedValue({
      wysiwygAdmissionBytes: 524288,
      wysiwygAdmissionLines: 2000,
      largeFileThreshold: 1048576,
      wysiwygMaxBytes: 2097152,
      sourceMaxBytes: 10485760,
      maxLines: 1000000,
    });

    await openSettingsPanel();

    // Hydration reads only the new fields; the legacy keys are ignored.
    expect((document.getElementById('setting-wysiwyg-max-size') as HTMLInputElement).value).toBe('2');
    expect((document.getElementById('setting-wysiwyg-max-size-unit') as HTMLSelectElement).value).toBe('MB');

    const maxLines = document.getElementById('setting-max-lines') as HTMLInputElement;
    maxLines.value = '500000';
    maxLines.dispatchEvent(new Event('change'));
    await flush();
    await flush();

    expect(saveSettings).toHaveBeenCalled();
    const saved = saveSettings.mock.lastCall![0] as Record<string, unknown>;
    // Legacy keys loaded from the old settings.json are stripped on save…
    expect(saved).not.toHaveProperty('wysiwygAdmissionBytes');
    expect(saved).not.toHaveProperty('wysiwygAdmissionLines');
    expect(saved).not.toHaveProperty('largeFileThreshold');
    // …while the new fields persist normally.
    expect(saved.wysiwygMaxBytes).toBe(2097152);
    expect(saved.sourceMaxBytes).toBe(10485760);
    expect(saved.maxLines).toBe(500000);
  });
});

it('exposes seven accessible categories and supports keyboard navigation', async () => {
  await openSettingsPanel();
  const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  expect(tabs.map(tab => tab.textContent)).toEqual(['通用','外观','编辑器','图片','高级','快捷键','关于']);
  tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  expect(tabs[1].getAttribute('aria-selected')).toBe('true');
  expect(document.activeElement).toBe(tabs[1]);
  expect(document.getElementById('panel-appearance')?.getAttribute('aria-labelledby')).toBe(tabs[1].id);
  expect(document.getElementById('setting-plantuml-server-url')?.closest('[role="tabpanel"]')?.id).toBe('panel-advanced');
});
it('disables autosave interval when off and stores entered seconds as milliseconds', async () => {
  await openSettingsPanel();
  const interval = document.getElementById('setting-autosave-interval') as HTMLInputElement;
  expect(interval.disabled).toBe(true);
  expect(interval.value).toBe('30');
  document.getElementById('setting-autosave')!.click();
  expect(interval.disabled).toBe(false);
  expect(document.getElementById('setting-autosave')!.getAttribute('aria-checked')).toBe('true');
  interval.value = '45'; interval.dispatchEvent(new Event('change'));
  await flush(); await flush();
  expect(saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ autosaveInterval: 45000 }));
});
it('rejects autosave intervals above the safe timer limit', async () => {
  await openSettingsPanel();
  const interval = document.getElementById('setting-autosave-interval') as HTMLInputElement;
  document.getElementById('setting-autosave')!.click();
  await flush(); await flush();
  vi.clearAllMocks();
  interval.value = '2147484'; interval.dispatchEvent(new Event('change'));
  await flush(); await flush();
  expect(interval.getAttribute('aria-invalid')).toBe('true');
  expect(saveSettings).not.toHaveBeenCalled();
});
it('searches descriptions across categories and highlights matches', async () => {
  await openSettingsPanel();
  const search = document.getElementById('settings-search') as HTMLInputElement;
  search.value = '源码模式'; search.dispatchEvent(new Event('input'));
  expect(document.getElementById('panel-general')!.hidden).toBe(true);
  expect(document.getElementById('panel-editor')!.hidden).toBe(false);
  expect(document.querySelector('mark')?.textContent).toBe('源码模式');
  search.value = '不存在的配置'; search.dispatchEvent(new Event('input'));
  expect(document.getElementById('settings-search-empty')!.hidden).toBe(false);
  search.value = ''; search.dispatchEvent(new Event('input'));
  expect(document.querySelectorAll('.settings-tab:not([hidden])')).toHaveLength(7);
});
it('resets only the selected settings group and persists the defaults', async () => {
  loadSettings.mockResolvedValue({ fontSize: 22, imageCustomPath: '/pictures', wysiwygMaxBytes: 2097152, sourceMaxBytes: 10485760 });
  await openSettingsPanel();
  (document.querySelector('[data-reset="limits"]') as HTMLButtonElement).click();
  await flush(); await flush();
  expect(saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ wysiwygMaxBytes: 1048576, fontSize: 22, imageCustomPath: '/pictures' }));
});
it('copies the public server URL and shows an inline check mark', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  await openSettingsPanel();
  const button = document.getElementById('setting-copy-plantuml')!;
  button.click(); await flush();
  expect(writeText).toHaveBeenCalledWith('https://www.plantuml.com/plantuml');
  expect(button.textContent).toBe('✓');
  expect(button.closest('.settings-warning')).not.toBeNull();
});
it('projects dropdown option text and selection through one native value', async () => {
  await openSettingsPanel();
  const native = document.getElementById('setting-fontsize') as HTMLSelectElement;
  const wrapper = native.closest('.settings-select-control')!;
  const trigger = wrapper.querySelector<HTMLButtonElement>('.settings-select-trigger')!;
  expect(trigger.textContent).toContain('20 px');
  trigger.click();
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  (wrapper.querySelector('[data-value="22"]') as HTMLButtonElement).click();
  await flush(); await flush();
  expect(native.value).toBe('22');
  expect(wrapper.querySelector('[data-value="22"]')!.getAttribute('aria-selected')).toBe('true');
  expect(saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ fontSize: 22 }));
});

it('keeps fractional units valid when re-expressing KB as MB', async () => {
  loadSettings.mockResolvedValue({ wysiwygMaxBytes: 524288 });
  await openSettingsPanel();
  const unit = document.getElementById('setting-wysiwyg-max-size-unit') as HTMLSelectElement;
  unit.value = 'MB'; unit.dispatchEvent(new Event('change'));
  await flush(); await flush();
  expect((document.getElementById('setting-wysiwyg-max-size') as HTMLInputElement).value).toBe('0.5');
  expect(saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ wysiwygMaxBytes: 524288 }));
});
it('shows the build version and only shortcuts from the active registry', async () => {
  vi.stubGlobal('__APP_VERSION__', '9.8.7-test');
  await openSettingsPanel();
  expect(document.querySelector('.settings-about')?.textContent).toContain('9.8.7-test');
  const { NATIVE_MENU_SHORTCUTS } = await import('../../../utils/keyboard');
  expect(document.querySelectorAll('#panel-shortcuts .shortcut-row')).toHaveLength(NATIVE_MENU_SHORTCUTS.filter(shortcut => !shortcut.placeholder).length);
  vi.unstubAllGlobals();
});
