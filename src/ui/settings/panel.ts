import '../../styles/settings.css';
// ── Settings panel ────────────────────────────────────────────────────
// Opens the settings modal, wires the controls, hydrates them from persisted
// settings and persists edits back. Markup lives in `markup.ts`, field
// read/write helpers in `fields.ts`.

import { setTheme } from '../../infra/theme';
import { loadSettings, saveSettings } from '../../infra/storage';
import { logException } from '../../infra/logger';
import { store } from '../../infra/store';
import { showModal } from '../modal';
import type { Settings } from '../../types/settings';
import { DEFAULT_SETTINGS } from '../../types/settings';
import { setSourceHighlight, setSourceSoftWrap } from '../../editor';
import { open } from '@tauri-apps/plugin-dialog';
import { createSettingsContent, SETTINGS_GROUP_KEYS } from './markup';
import { initSettingsNavigation } from './navigation';
import { initSettingsControls, syncSettingsControls } from './controls';
import {
  applySettingsToUI,
  buildSettingsFromUI,
  readDocumentLimitsFromUI,
  setInputValue,
  validateDocumentLimits,
  type Theme,
} from './fields';

let currentSettings: Settings = { ...DEFAULT_SETTINGS };

let settingsModalHide: (() => void) | null = null;

export function initSettings() {
  // Settings is opened on demand from toolbar; initSettings wires up
}

export function showSettings() {
  // Close if already open
  if (settingsModalHide) {
    settingsModalHide();
    settingsModalHide = null;
    return;
  }

  const content = createSettingsContent();
  const modal = showModal({
    content,
    className: 'modal-settings',
    onClose: () => { settingsModalHide = null; },
  });
  settingsModalHide = modal.hide;

  bindSettingsEvents(modal.hide);
  void hydrateSettingsUI(document.querySelector<HTMLElement>('.settings-layout')!);
}

function bindSettingsEvents(hide: () => void) {
  document.getElementById('settings-close')?.addEventListener('click', hide);

  const root = document.querySelector<HTMLElement>('.settings-layout')!;
  root.closest('[role="dialog"]')?.setAttribute('aria-label', '设置');
  initSettingsNavigation(root);
  initSettingsControls(root);
  root.querySelectorAll<HTMLElement>('[data-reset]').forEach(button => {
    button.addEventListener('click', async () => {
      const next = buildSettingsFromUI(currentSettings);
      for (const key of SETTINGS_GROUP_KEYS[button.dataset.reset!] ?? []) {
        Object.assign(next, { [key]: DEFAULT_SETTINGS[key as keyof typeof DEFAULT_SETTINGS] });
      }
      applySettingsToUI(next);
      syncSettingsControls(root);
      await persistSettingsFromUI();
    });
  });

  document.querySelectorAll('.toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      toggle.classList.toggle('active');
      toggle.setAttribute('aria-checked', String(toggle.classList.contains('active')));
      const interval = root.querySelector<HTMLInputElement>('#setting-autosave-interval');
      if (interval) interval.disabled = !root.querySelector('#setting-autosave')?.classList.contains('active');
      syncSettingsControls(root);
      void persistSettingsFromUI();
    });
  });

  document.querySelectorAll('.theme-swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
      const theme = (swatch as HTMLElement).dataset.theme as Theme;
      document.querySelectorAll('.theme-swatch').forEach(s => s.classList.remove('selected'));
      swatch.classList.add('selected');
      setTheme(theme);
      void persistSettingsFromUI();
    });
  });

  const storageSelect = document.getElementById('setting-image-storage') as HTMLSelectElement | null;
  const customRow = document.getElementById('setting-image-custom-row');
  const namedDirHelp = document.getElementById('setting-image-named-dir-help');
  if (storageSelect && customRow) {
    storageSelect.addEventListener('change', () => {
      customRow.hidden = storageSelect.value !== 'custom';
      if (namedDirHelp) namedDirHelp.hidden = storageSelect.value !== 'document-named-dir';
    });
  }

  // Switching a KB/MB unit re-expresses the entered number in the new unit
  // (1 MB ↔ 1024 KB) so the byte size survives the switch. Attached BEFORE
  // the generic `.settings-select` listener below, which then persists the
  // converted state.
  const unitSelectIds: Array<[valueId: string, unitId: string]> = [
    ['setting-wysiwyg-max-size', 'setting-wysiwyg-max-size-unit'],
    ['setting-source-max-size', 'setting-source-max-size-unit'],
  ];
  for (const [valueId, unitId] of unitSelectIds) {
    document.getElementById(unitId)?.addEventListener('change', () => {
      const unitEl = document.getElementById(unitId) as HTMLSelectElement | null;
      const input = document.getElementById(valueId) as HTMLInputElement | null;
      if (!unitEl || !input) return;
      const previousUnit = unitEl.dataset.prevUnit ?? unitEl.value;
      const value = Number(input.value);
      if (previousUnit !== unitEl.value && Number.isFinite(value)) {
        const bytes = value * (previousUnit === 'MB' ? 1048576 : 1024);
        input.value = String(bytes / (unitEl.value === 'MB' ? 1048576 : 1024));
      }
      unitEl.dataset.prevUnit = unitEl.value;
    });
  }

  document.querySelectorAll('.settings-select').forEach(select => {
    select.addEventListener('change', () => {
      void persistSettingsFromUI();
    });
  });

  for (const id of ['setting-image-custom-path', 'setting-image-clipboard-template']) {
    document.getElementById(id)?.addEventListener('change', () => void persistSettingsFromUI());
  }
  document.getElementById('setting-image-choose-folder')?.addEventListener('click', async () => {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected !== 'string') return;
    setInputValue('setting-image-custom-path', selected);
    if (storageSelect) storageSelect.value = 'custom';
    if (customRow) customRow.hidden = false;
    if (namedDirHelp) namedDirHelp.hidden = true;
    await persistSettingsFromUI();
  });
  document.getElementById('setting-plantuml-server-url')?.addEventListener('change', () => void persistSettingsFromUI());

  for (const id of [
    'setting-autosave-interval', 'setting-filetree-ignore', 'setting-filetree-page-size', 'setting-filetree-depth',
    'setting-wysiwyg-max-size', 'setting-source-max-size', 'setting-max-lines',
  ]) {
    document.getElementById(id)?.addEventListener('change', () => void persistSettingsFromUI());
  }
}

async function hydrateSettingsUI(root: HTMLElement) {
  try {
    const loaded = await loadSettings();
    currentSettings = { ...DEFAULT_SETTINGS, ...loaded };
  } catch (e) {
    logException('settings.ui', 'Failed to load settings UI state', e);
    currentSettings = { ...DEFAULT_SETTINGS };
  }

  if (!root.isConnected) return;
  applySettingsToUI(currentSettings);
  syncSettingsControls();
  applyRuntimeSettings(currentSettings);
}

function applyRuntimeSettings(settings: Settings) {
  setTheme(String(settings.theme ?? 'light') as Theme);

  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.toggle('collapsed', settings.showSidebar === false);

  const sourceEditor = document.getElementById('source-editor') as HTMLTextAreaElement | null;
  if (sourceEditor) {
    sourceEditor.spellcheck = settings.spellcheck !== false;
    sourceEditor.style.fontSize = `${Number(settings.fontSize ?? DEFAULT_SETTINGS.fontSize)}px`;
    sourceEditor.style.lineHeight = String(settings.lineHeight ?? DEFAULT_SETTINGS.lineHeight);
    sourceEditor.style.whiteSpace = settings.softWrap === false ? 'pre' : 'pre-wrap';
  }

  const wysiwygEditor = document.getElementById('wysiwyg-editor');
  if (wysiwygEditor) {
    const root = wysiwygEditor.querySelector('.ProseMirror') as HTMLElement | null;
    if (root) {
      root.spellcheck = settings.spellcheck !== false;
      root.style.fontSize = `${Number(settings.fontSize ?? DEFAULT_SETTINGS.fontSize)}px`;
      root.style.lineHeight = String(settings.lineHeight ?? DEFAULT_SETTINGS.lineHeight);
      root.style.whiteSpace = settings.softWrap === false ? 'pre' : 'normal';
    }
  }

  // Apply code highlight to source editor (CodeMirror)
  setSourceHighlight(settings.codeHighlight !== false);
  // Soft wrap is instant-applied to the source editor through the same path.
  setSourceSoftWrap(settings.softWrap !== false);
}

async function persistSettingsFromUI() {
  if (!validateSettingsFields()) return;

  const uiSettings = buildSettingsFromUI(currentSettings);

  try {
    const persisted = await loadSettings();
    currentSettings = { ...persisted, ...uiSettings };
    // Strip unknown keys (e.g. legacy fields removed from DEFAULT_SETTINGS) so
    // they don't accumulate in settings.json across saves.
    const knownKeys = new Set(Object.keys(DEFAULT_SETTINGS));
    for (const key of Object.keys(currentSettings)) {
      if (!knownKeys.has(key)) delete (currentSettings as unknown as Record<string, unknown>)[key];
    }
    applyRuntimeSettings(currentSettings);
    await saveSettings(currentSettings);
    store.emit({ type: 'settings:changed', settings: { ...currentSettings } });
  } catch (e) {
    logException('settings.ui', 'Failed to save settings', e);
  }
}

function validateSettingsFields(): boolean {
  let valid = true;
  document.querySelectorAll('.settings-field-error').forEach(error => error.remove());
  document.querySelectorAll<HTMLElement>('[aria-invalid]').forEach(field => { field.removeAttribute('aria-invalid'); field.removeAttribute('aria-describedby'); });
  const mark = (field: HTMLInputElement, message: string) => {
    field.setAttribute('aria-invalid', 'true');
    const error = document.createElement('div');
    error.id = `${field.id}-error`; error.className = 'settings-field-error'; error.textContent = message; error.setAttribute('role', 'alert');
    field.closest('.settings-row')?.firstElementChild?.append(error);
    field.setAttribute('aria-describedby', error.id); valid = false;
  };
  const documentLimits = readDocumentLimitsFromUI();
  const limitsError = validateDocumentLimits(documentLimits);
  const limitsErrorEl = document.getElementById('setting-document-limits-error');
  if (limitsErrorEl) { limitsErrorEl.hidden = !limitsError; limitsErrorEl.textContent = limitsError ?? ''; }
  document.querySelectorAll<HTMLInputElement>('.settings-layout input[type="number"]').forEach(input => {
    if (input.disabled) return;
    const value = Number(input.value);
    if (!input.value || !Number.isFinite(value) || value < Number(input.min) || value > Number(input.max) || (input.step !== 'any' && !Number.isInteger(value))) {
      mark(input, value <= 0 ? '数值必须大于 0' : `请输入 ${input.min}–${input.max} 范围内的有效数值`);
    }
  });
  if (limitsError) {
    valid = false;
    const toBytes = (value: number, unit: string) => value * (unit === 'MB' ? 1048576 : 1024);
    const invalidSizeField = Math.round(toBytes(documentLimits.wysiwygMaxSize, documentLimits.wysiwygUnit)) < 1
      ? 'setting-wysiwyg-max-size'
      : 'setting-source-max-size';
    const field = document.getElementById(invalidSizeField) as HTMLInputElement;
    if (field.getAttribute('aria-invalid') !== 'true') mark(field, limitsError);
  }
  return valid;
}
