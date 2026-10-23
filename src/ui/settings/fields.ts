// ── Settings field read/write helpers ─────────────────────────────────
// Thin typed wrappers over the settings modal DOM (toggles, selects, inputs)
// plus the Settings object built from the current UI state.

import type { Settings } from '../../types/settings';
import { DEFAULT_SETTINGS } from '../../types/settings';

export type Theme = 'light' | 'dark' | 'sepia';

export function getSelectedTheme(): Theme {
  const selected = document.querySelector('.theme-swatch.selected') as HTMLElement | null;
  return (selected?.dataset.theme as Theme) || 'light';
}

export function getToggleState(id: string) {
  return document.getElementById(id)?.classList.contains('active') === true;
}

export function setToggleState(id: string, active: boolean) {
  document.getElementById(id)?.classList.toggle('active', active);
}

export function getSelectValue(id: string) {
  return (document.getElementById(id) as HTMLSelectElement | null)?.value || '';
}

export function setSelectValue(id: string, value: string) {
  const el = document.getElementById(id) as HTMLSelectElement | null;
  if (el) el.value = value;
}

export function getInputValue(id: string) {
  return (document.getElementById(id) as HTMLInputElement | null)?.value || '';
}

export function setInputValue(id: string, value: string) {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (el) el.value = value;
}

/** Snapshot the whole modal into a Settings object. */
export function buildSettingsFromUI(currentSettings: Settings): Settings {
  return {
    ...currentSettings,
    version: 3,
    theme: getSelectedTheme(),
    fontSize: Number(getSelectValue('setting-fontsize') || DEFAULT_SETTINGS.fontSize),
    lineHeight: Number(getSelectValue('setting-lineheight') || DEFAULT_SETTINGS.lineHeight),
    autosave: getToggleState('setting-autosave'),
    autosaveInterval: Number(getSelectValue('setting-autosave-interval') || 10000),
    spellcheck: getToggleState('setting-spellcheck'),
    softWrap: getToggleState('setting-softwrap'),
    codeHighlight: getToggleState('setting-codehighlight'),
    plantumlServerUrl: getInputValue('setting-plantuml-server-url').trim(),
    codeLineNumbers: getToggleState('setting-code-linenumbers'),
    codeWordWrap: getToggleState('setting-code-wordwrap'),
    showSidebar: getToggleState('setting-sidebar'),
    showTooltips: getToggleState('setting-tooltips'),
    followSystemTheme: getToggleState('setting-follow-system'),
    imageStorageMode: (getSelectValue('setting-image-storage') || 'custom') as Settings['imageStorageMode'],
    imageCustomPath: getInputValue('setting-image-custom-path').trim() || './images',
    imageApplyToLocal: getToggleState('setting-image-apply-local'),
    imageApplyToNetwork: getToggleState('setting-image-apply-network'),
    imageReferenceStyle: (getSelectValue('setting-image-reference-style') || 'relative') as Settings['imageReferenceStyle'],
    imageClipboardNameTemplate: getInputValue('setting-image-clipboard-template').trim() || 'img-${date:yyyyMMdd}${time:HHmmss}',
    fileTreeIgnorePatterns: getInputValue('setting-filetree-ignore').split(',').map(value => value.trim()).filter(Boolean),
    fileTreePageSize: Math.min(5000, Math.max(50, Number(getInputValue('setting-filetree-page-size')) || 500)),
    fileTreeAutoLoadDepth: Math.min(32, Math.max(1, Number(getInputValue('setting-filetree-depth')) || 8)),
  };
}

/** Push a Settings object into the modal controls. */
export function applySettingsToUI(settings: Settings) {
  setToggleState('setting-autosave', settings.autosave !== false);
  setSelectValue('setting-autosave-interval', String(settings.autosaveInterval ?? 10000));
  setToggleState('setting-spellcheck', settings.spellcheck !== false);
  setToggleState('setting-softwrap', settings.softWrap !== false);
  setToggleState('setting-codehighlight', settings.codeHighlight !== false);
  setToggleState('setting-sidebar', settings.showSidebar !== false);
  setToggleState('setting-tooltips', settings.showTooltips !== false);
  setToggleState('setting-follow-system', settings.followSystemTheme === true);

  setSelectValue('setting-fontsize', String(settings.fontSize ?? DEFAULT_SETTINGS.fontSize));
  setSelectValue('setting-lineheight', String(settings.lineHeight ?? DEFAULT_SETTINGS.lineHeight));
  setSelectValue('setting-image-storage', String(settings.imageStorageMode ?? 'custom'));
  setInputValue('setting-image-custom-path', String(settings.imageCustomPath ?? './images'));
  setToggleState('setting-image-apply-local', settings.imageApplyToLocal !== false);
  setToggleState('setting-image-apply-network', settings.imageApplyToNetwork !== false);
  setSelectValue('setting-image-reference-style', String(settings.imageReferenceStyle ?? 'relative'));
  setToggleState('setting-code-linenumbers', settings.codeLineNumbers === true);
  setToggleState('setting-code-wordwrap', settings.codeWordWrap !== false);
  setInputValue('setting-image-clipboard-template', String(settings.imageClipboardNameTemplate ?? 'img-${date:yyyyMMdd}${time:HHmmss}'));
  setInputValue('setting-filetree-ignore', (settings.fileTreeIgnorePatterns ?? DEFAULT_SETTINGS.fileTreeIgnorePatterns ?? []).join(', '));
  setInputValue('setting-filetree-page-size', String(settings.fileTreePageSize ?? 500));
  setInputValue('setting-filetree-depth', String(settings.fileTreeAutoLoadDepth ?? 8));
  setInputValue('setting-plantuml-server-url', String(settings.plantumlServerUrl ?? ''));

  const selectedTheme = String(settings.theme ?? 'light') as Theme;
  document.querySelectorAll('.theme-swatch').forEach(swatch => {
    swatch.classList.toggle('selected', (swatch as HTMLElement).dataset.theme === selectedTheme);
  });

  const customRow = document.getElementById('setting-image-custom-row');
  const namedDirHelp = document.getElementById('setting-image-named-dir-help');
  if (customRow) customRow.hidden = getSelectValue('setting-image-storage') !== 'custom';
  if (namedDirHelp) namedDirHelp.hidden = getSelectValue('setting-image-storage') !== 'document-named-dir';
}
