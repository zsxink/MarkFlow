// ── Settings field read/write helpers ─────────────────────────────────
// Thin typed wrappers over the settings modal DOM (toggles, selects, inputs)
// plus the Settings object built from the current UI state.

import type { Settings } from '../../types/settings';
import { DEFAULT_SETTINGS, MAX_AUTOSAVE_INTERVAL_MS } from '../../types/settings';

export type Theme = 'light' | 'dark' | 'sepia';

export function getSelectedTheme(): Theme {
  const selected = document.querySelector('.theme-swatch.selected') as HTMLElement | null;
  return (selected?.dataset.theme as Theme) || 'light';
}

export function getToggleState(id: string) {
  return document.getElementById(id)?.classList.contains('active') === true;
}

export function setToggleState(id: string, active: boolean) {
  const element = document.getElementById(id);
  element?.classList.toggle('active', active);
  element?.setAttribute('aria-checked', String(active));
}

export function getSelectValue(id: string) {
  return (document.getElementById(id) as HTMLSelectElement | null)?.value || '';
}

export function setSelectValue(id: string, value: string) {
  const el = document.getElementById(id) as HTMLSelectElement | null;
  if (el) el.value = value;
}

/**
 * Set a KB/MB unit select and remember the shown unit, so a later unit switch
 * can re-express the same byte size instead of reinterpreting the raw number.
 */
function setSizeUnit(id: string, unit: string) {
  const el = document.getElementById(id) as HTMLSelectElement | null;
  if (!el) return;
  el.value = unit;
  el.dataset.prevUnit = unit;
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
  // Document limits are validated by the panel before persisting; here the
  // inputs are converted as-is (KB/MB → bytes) so a valid UI state persists exactly.
  const limits = readDocumentLimitsFromUI();
  const sizeToBytes = (value: number, unit: string, fallbackBytes: number) =>
    Number.isFinite(value) ? Math.round(value * (unit === 'MB' ? 1048576 : 1024)) : fallbackBytes;
  const count = (value: number, fallback: number) =>
    Number.isFinite(value) ? Math.round(value) : fallback;
  return {
    ...currentSettings,
    version: 3,
    theme: getSelectedTheme(),
    fontSize: Number(getSelectValue('setting-fontsize') || DEFAULT_SETTINGS.fontSize),
    lineHeight: Number(getSelectValue('setting-lineheight') || DEFAULT_SETTINGS.lineHeight),
    autosave: getToggleState('setting-autosave'),
    autosaveInterval: Number(getInputValue('setting-autosave-interval')) > 0
      ? Math.min(Number(getInputValue('setting-autosave-interval')) * 1000, MAX_AUTOSAVE_INTERVAL_MS)
      : currentSettings.autosaveInterval || DEFAULT_SETTINGS.autosaveInterval,
    restoreWorkspace: getToggleState('setting-restore-workspace'),
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
    fileBrowserShowUnsupportedFiles: getToggleState('setting-filetree-show-unsupported'),
    wysiwygMaxBytes: sizeToBytes(limits.wysiwygMaxSize, limits.wysiwygUnit, currentSettings.wysiwygMaxBytes ?? DEFAULT_SETTINGS.wysiwygMaxBytes),
    sourceMaxBytes: sizeToBytes(limits.sourceMaxSize, limits.sourceUnit, currentSettings.sourceMaxBytes ?? DEFAULT_SETTINGS.sourceMaxBytes),
    maxLines: count(limits.maxLines, currentSettings.maxLines ?? DEFAULT_SETTINGS.maxLines),
  };
}

/** Parsed document-limit inputs; NaN marks a non-numeric field. */
export interface DocumentLimitsInput {
  wysiwygMaxSize: number;
  wysiwygUnit: string;
  sourceMaxSize: number;
  sourceUnit: string;
  maxLines: number;
}

/** Parse the document-limits group inputs (volume fields pair with a KB/MB unit). */
export function readDocumentLimitsFromUI(): DocumentLimitsInput {
  const num = (id: string) => Number(getInputValue(id));
  const unit = (id: string) => getSelectValue(id) || 'KB';
  return {
    wysiwygMaxSize: num('setting-wysiwyg-max-size'),
    wysiwygUnit: unit('setting-wysiwyg-max-size-unit'),
    sourceMaxSize: num('setting-source-max-size'),
    sourceUnit: unit('setting-source-max-size-unit'),
    maxLines: num('setting-max-lines'),
  };
}

/**
 * Cross-field validation for the document-limits group; unlike other numeric
 * fields these rules cannot be expressed by clamping. Returns a user-facing
 * error message, or null when every value is valid.
 *
 * Unconditional: the shipped defaults (1MB ≤ 10MB) are inherently legal, so
 * no legacy-combination exemption path exists.
 */
export function validateDocumentLimits(raw: DocumentLimitsInput): string | null {
  const toBytes = (value: number, unit: string) => value * (unit === 'MB' ? 1048576 : 1024);
  if (![raw.wysiwygMaxSize, raw.sourceMaxSize, raw.maxLines].every(value => Number.isFinite(value) && value > 0)) {
    return '所有数值必须大于 0';
  }
  if (Math.round(toBytes(raw.wysiwygMaxSize, raw.wysiwygUnit)) < 1
    || Math.round(toBytes(raw.sourceMaxSize, raw.sourceUnit)) < 1) {
    return '文档大小必须至少为 1 字节';
  }
  if (toBytes(raw.wysiwygMaxSize, raw.wysiwygUnit) > toBytes(raw.sourceMaxSize, raw.sourceUnit)) {
    return '所见即所得文档大小不能超过源码文档大小';
  }
  return null;
}

/** Push a Settings object into the modal controls. */
export function applySettingsToUI(settings: Settings) {
  setToggleState('setting-autosave', settings.autosave !== false);
  setInputValue('setting-autosave-interval', String(Math.min(settings.autosaveInterval ?? DEFAULT_SETTINGS.autosaveInterval, MAX_AUTOSAVE_INTERVAL_MS) / 1000));
  setToggleState('setting-restore-workspace', settings.restoreWorkspace !== false);
  const interval = document.getElementById('setting-autosave-interval') as HTMLInputElement | null;
  if (interval) interval.disabled = settings.autosave === false;
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
  setToggleState('setting-filetree-show-unsupported', settings.fileBrowserShowUnsupportedFiles === true);
  setInputValue('setting-plantuml-server-url', String(settings.plantumlServerUrl ?? ''));

  // Volume fields are stored as bytes and displayed in the largest unit that
  // divides them exactly: whole-MB values (≥1MB) as MB, everything else as KB.
  const splitSize = (bytes: number | undefined, fallback: number): { value: number; unit: string } => {
    const b = bytes ?? fallback;
    return b % 1048576 === 0 && b >= 1048576
      ? { value: b / 1048576, unit: 'MB' }
      : { value: b / 1024, unit: 'KB' };
  };
  const countOf = (value: number | undefined, fallback: number) =>
    String(value ?? fallback);
  const wysiwygSize = splitSize(settings.wysiwygMaxBytes, DEFAULT_SETTINGS.wysiwygMaxBytes);
  setInputValue('setting-wysiwyg-max-size', String(wysiwygSize.value));
  setSizeUnit('setting-wysiwyg-max-size-unit', wysiwygSize.unit);
  const sourceSize = splitSize(settings.sourceMaxBytes, DEFAULT_SETTINGS.sourceMaxBytes);
  setInputValue('setting-source-max-size', String(sourceSize.value));
  setSizeUnit('setting-source-max-size-unit', sourceSize.unit);
  setInputValue('setting-max-lines', countOf(settings.maxLines, DEFAULT_SETTINGS.maxLines));

  const selectedTheme = String(settings.theme ?? 'light') as Theme;
  document.querySelectorAll('.theme-swatch').forEach(swatch => {
    swatch.classList.toggle('selected', (swatch as HTMLElement).dataset.theme === selectedTheme);
  });

  const customRow = document.getElementById('setting-image-custom-row');
  const namedDirHelp = document.getElementById('setting-image-named-dir-help');
  if (customRow) customRow.hidden = getSelectValue('setting-image-storage') !== 'custom';
  if (namedDirHelp) namedDirHelp.hidden = getSelectValue('setting-image-storage') !== 'document-named-dir';
}
