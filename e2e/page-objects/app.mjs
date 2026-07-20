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
  settings: () => $('#btn-settings'),
  toast: () => $('[role="status"]'),
  file: (name) => $(`[data-testid="file-tree-item"]`).$(`span=${name}`),
};

export async function waitForAppReady() {
  await (await app.ready()).waitForDisplayed({ timeout: 30_000 });
  await (await app.wysiwyg()).waitForDisplayed({ timeout: 10_000 });
}

export async function showFiles() {
  await (await app.filesTab()).click();
}
