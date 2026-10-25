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
  // Document limits are validated by the panel before persisting; here the
  // inputs are converted as-is (KB → bytes) so a valid UI state persists exactly.
  const limits = readDocumentLimitsFromUI();
  const kbToBytes = (kb: number, fallbackBytes: number) =>
    Number.isFinite(kb) ? Math.round(kb * 1024) : fallbackBytes;
  const count = (value: number, fallback: number) =>
    Number.isFinite(value) ? Math.round(value) : fallback;
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
    fileBrowserShowUnsupportedFiles: getToggleState('setting-filetree-show-unsupported'),
    wysiwygAdmissionBytes: kbToBytes(limits.wysiwygAdmissionKb, currentSettings.wysiwygAdmissionBytes ?? DEFAULT_SETTINGS.wysiwygAdmissionBytes),
    wysiwygAdmissionLines: count(limits.wysiwygAdmissionLines, currentSettings.wysiwygAdmissionLines ?? DEFAULT_SETTINGS.wysiwygAdmissionLines),
    wysiwygMaxNodes: count(limits.wysiwygMaxNodes, currentSettings.wysiwygMaxNodes ?? DEFAULT_SETTINGS.wysiwygMaxNodes),
    wysiwygMaxTextLength: count(limits.wysiwygMaxTextLength, currentSettings.wysiwygMaxTextLength ?? DEFAULT_SETTINGS.wysiwygMaxTextLength),
    largeFileThreshold: kbToBytes(limits.largeFileKb, currentSettings.largeFileThreshold ?? DEFAULT_SETTINGS.largeFileThreshold),
    hugeFileThreshold: kbToBytes(limits.hugeFileKb, currentSettings.hugeFileThreshold ?? DEFAULT_SETTINGS.hugeFileThreshold),
    largeFileLineThreshold: count(limits.largeFileLines, currentSettings.largeFileLineThreshold ?? DEFAULT_SETTINGS.largeFileLineThreshold),
    hugeFileLineThreshold: count(limits.hugeFileLines, currentSettings.hugeFileLineThreshold ?? DEFAULT_SETTINGS.hugeFileLineThreshold),
  };
}

/** Parsed document-limit inputs; NaN marks a non-numeric field. */
export interface DocumentLimitsInput {
  wysiwygAdmissionKb: number;
  wysiwygAdmissionLines: number;
  wysiwygMaxNodes: number;
  wysiwygMaxTextLength: number;
  largeFileKb: number;
  hugeFileKb: number;
  largeFileLines: number;
  hugeFileLines: number;
}

/** Parse the document-limits group inputs (volume fields are entered in KB). */
export function readDocumentLimitsFromUI(): DocumentLimitsInput {
  const num = (id: string) => Number(getInputValue(id));
  return {
    wysiwygAdmissionKb: num('setting-wysiwyg-admission-kb'),
    wysiwygAdmissionLines: num('setting-wysiwyg-admission-lines'),
    wysiwygMaxNodes: num('setting-wysiwyg-max-nodes'),
    wysiwygMaxTextLength: num('setting-wysiwyg-max-text-length'),
    largeFileKb: num('setting-large-file-kb'),
    hugeFileKb: num('setting-huge-file-kb'),
    largeFileLines: num('setting-large-file-lines'),
    hugeFileLines: num('setting-huge-file-lines'),
  };
}

/** Persisted values in the same shape as `DocumentLimitsInput`. */
export interface DocumentLimitsBaseline {
  wysiwygAdmissionKb: number;
  wysiwygAdmissionLines: number;
  largeFileKb: number;
  hugeFileKb: number;
  largeFileLines: number;
  hugeFileLines: number;
}

export function documentLimitsBaselineFromSettings(settings: Settings): DocumentLimitsBaseline {
  const kbOf = (bytes: number | undefined, fallback: number) => Math.floor((bytes ?? fallback) / 1024);
  return {
    wysiwygAdmissionKb: kbOf(settings.wysiwygAdmissionBytes, DEFAULT_SETTINGS.wysiwygAdmissionBytes),
    wysiwygAdmissionLines: settings.wysiwygAdmissionLines ?? DEFAULT_SETTINGS.wysiwygAdmissionLines,
    largeFileKb: kbOf(settings.largeFileThreshold, DEFAULT_SETTINGS.largeFileThreshold),
    hugeFileKb: kbOf(settings.hugeFileThreshold, DEFAULT_SETTINGS.hugeFileThreshold),
    largeFileLines: settings.largeFileLineThreshold ?? DEFAULT_SETTINGS.largeFileLineThreshold,
    hugeFileLines: settings.hugeFileLineThreshold ?? DEFAULT_SETTINGS.hugeFileLineThreshold,
  };
}

/**
 * Cross-field validation for the document-limits group; unlike other numeric
 * fields these rules cannot be expressed by clamping. Returns a user-facing
 * error message, or null when every value is valid.
 *
 * Pairwise ordering rules only bind pairs the user actually edited: the
 * shipped defaults predate this validation (admission 10k lines exceeds the
 * large-file 5k line tier), so an untouched legacy combination must keep
 * saving unchanged instead of blocking every unrelated settings edit.
 */
export function validateDocumentLimits(raw: DocumentLimitsInput, baseline: DocumentLimitsBaseline): string | null {
  const values: number[] = [
    raw.wysiwygAdmissionKb, raw.wysiwygAdmissionLines, raw.wysiwygMaxNodes, raw.wysiwygMaxTextLength,
    raw.largeFileKb, raw.hugeFileKb, raw.largeFileLines, raw.hugeFileLines,
  ];
  if (values.some(value => !(value > 0))) return '所有数值必须大于 0';
  const pairEdited = (a: number, b: number, baseA: number, baseB: number) => a !== baseA || b !== baseB;
  if (pairEdited(raw.largeFileKb, raw.hugeFileKb, baseline.largeFileKb, baseline.hugeFileKb)
    && raw.largeFileKb >= raw.hugeFileKb) {
    return '大文件体积阈值必须小于超大文件体积阈值';
  }
  if (pairEdited(raw.largeFileLines, raw.hugeFileLines, baseline.largeFileLines, baseline.hugeFileLines)
    && raw.largeFileLines >= raw.hugeFileLines) {
    return '大文件行数阈值必须小于超大文件行数阈值';
  }
  if (pairEdited(raw.wysiwygAdmissionKb, raw.largeFileKb, baseline.wysiwygAdmissionKb, baseline.largeFileKb)
    && raw.wysiwygAdmissionKb > raw.largeFileKb) {
    return '准入体积上限不能超过大文件体积阈值';
  }
  if (pairEdited(raw.wysiwygAdmissionLines, raw.largeFileLines, baseline.wysiwygAdmissionLines, baseline.largeFileLines)
    && raw.wysiwygAdmissionLines > raw.largeFileLines) {
    return '准入行数上限不能超过大文件行数阈值';
  }
  return null;
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
  setToggleState('setting-filetree-show-unsupported', settings.fileBrowserShowUnsupportedFiles === true);
  setInputValue('setting-plantuml-server-url', String(settings.plantumlServerUrl ?? ''));

  // Volume fields are stored as bytes but entered/shown as whole KB.
  const kbOf = (bytes: number | undefined, fallback: number) =>
    String(Math.floor((bytes ?? fallback) / 1024));
  const countOf = (value: number | undefined, fallback: number) =>
    String(value ?? fallback);
  setInputValue('setting-wysiwyg-admission-kb', kbOf(settings.wysiwygAdmissionBytes, DEFAULT_SETTINGS.wysiwygAdmissionBytes));
  setInputValue('setting-wysiwyg-admission-lines', countOf(settings.wysiwygAdmissionLines, DEFAULT_SETTINGS.wysiwygAdmissionLines));
  setInputValue('setting-wysiwyg-max-nodes', countOf(settings.wysiwygMaxNodes, DEFAULT_SETTINGS.wysiwygMaxNodes));
  setInputValue('setting-wysiwyg-max-text-length', countOf(settings.wysiwygMaxTextLength, DEFAULT_SETTINGS.wysiwygMaxTextLength));
  setInputValue('setting-large-file-kb', kbOf(settings.largeFileThreshold, DEFAULT_SETTINGS.largeFileThreshold));
  setInputValue('setting-huge-file-kb', kbOf(settings.hugeFileThreshold, DEFAULT_SETTINGS.hugeFileThreshold));
  setInputValue('setting-large-file-lines', countOf(settings.largeFileLineThreshold, DEFAULT_SETTINGS.largeFileLineThreshold));
  setInputValue('setting-huge-file-lines', countOf(settings.hugeFileLineThreshold, DEFAULT_SETTINGS.hugeFileLineThreshold));

  const selectedTheme = String(settings.theme ?? 'light') as Theme;
  document.querySelectorAll('.theme-swatch').forEach(swatch => {
    swatch.classList.toggle('selected', (swatch as HTMLElement).dataset.theme === selectedTheme);
  });

  const customRow = document.getElementById('setting-image-custom-row');
  const namedDirHelp = document.getElementById('setting-image-named-dir-help');
  if (customRow) customRow.hidden = getSelectValue('setting-image-storage') !== 'custom';
  if (namedDirHelp) namedDirHelp.hidden = getSelectValue('setting-image-storage') !== 'document-named-dir';
}
