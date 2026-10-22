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
  toast: () => $('#toast'),
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
  await browser.waitUntil(async () => {
    const [wysiwyg, source] = await Promise.all([app.wysiwyg(), app.sourceContent()]);
    const [wysiwygDisplayed, sourceDisplayed] = await Promise.all([
      wysiwyg.isDisplayed(),
      source.isDisplayed(),
    ]);
    return wysiwygDisplayed || sourceDisplayed;
  }, {
    timeout: 10_000,
    timeoutMsg: 'Expected the active WYSIWYG or source editor to be displayed',
  });
}

export async function showFiles() {
  await (await app.filesTab()).click();
}

export async function openFileInTree(name) {
  await showFiles();
  const item = app.fileTreeItem(name);
  await item.waitForDisplayed({ timeout: 10_000 });
  const expectedPath = await item.getAttribute('data-path');
  await item.click();
  await browser.waitUntil(async () => {
    const tabs = await $$('#document-tabs .document-tab[role="tab"]');
    for (const tab of tabs) {
      if (await tab.getAttribute('title') === expectedPath
        && await tab.getAttribute('aria-selected') === 'true') return true;
    }
    return false;
  }, {
    timeout: 10_000,
    timeoutMsg: `Expected the document tab for ${name} to become active`,
  });
}

export async function openSettings() {
  await (await app.settingsBtn()).click();
  await (await app.settingsModal()).waitForDisplayed({ timeout: 5_000 });
}

export async function closeSettings() {
  await (await app.settingsClose()).click();
  await (await app.settingsModal()).waitForDisplayed({ timeout: 5_000, reverse: true });
}
