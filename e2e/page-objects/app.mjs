export const app = {
  ready: () => $('#app[data-app-ready="true"]'),
  wysiwyg: () => $('[data-testid="editor-wysiwyg"]'),
  source: () => $('[data-testid="editor-source"]'),
  sourceContent: () => $('[data-testid="editor-source-content"]'),
  save: () => $('#btn-save'),
  bold: () => $('#btn-bold'),
  filesTab: () => $('[data-tab="files"]'),
  sourceMode: () => $('#btn-source'),
  wysiwygMode: () => $('#btn-wysiwyg'),
  settingsBtn: () => $('#btn-settings'),
  toast: () => $('[role="status"]'),
  file: (name) => $(`[data-testid="file-tree-item"]`).$(`span=${name}`),

  // ── Settings modal ──────────────────────────────────────────────
  settingsModal: () => $('.modal-settings'),
  settingsTab: (panel) => $(`.settings-tab[data-panel="${panel}"]`),
  settingsPanel: (panel) => $(`#panel-${panel}`),
  settingsClose: () => $('#settings-close'),
  themeSwatch: (theme) => $(`#theme-${theme}-preview`),

  // ── File tree ───────────────────────────────────────────────────
  fileTreeItem: (name) => $(`[data-testid="file-tree-item"][data-path$="/${name}"]`),
};

export async function waitForAppReady() {
  await (await app.ready()).waitForDisplayed({ timeout: 30_000 });
  await (await app.wysiwyg()).waitForDisplayed({ timeout: 10_000 });
}

export async function showFiles() {
  await (await app.filesTab()).click();
}

export async function openFileInTree(name) {
  await showFiles();
  const item = app.fileTreeItem(name);
  await item.waitForDisplayed({ timeout: 10_000 });
  await item.click();
}

export async function openSettings() {
  await (await app.settingsBtn()).click();
  await (await app.settingsModal()).waitForDisplayed({ timeout: 5_000 });
}

export async function closeSettings() {
  await (await app.settingsClose()).click();
  await (await app.settingsModal()).waitForDisplayed({ timeout: 5_000, reverse: true });
}
