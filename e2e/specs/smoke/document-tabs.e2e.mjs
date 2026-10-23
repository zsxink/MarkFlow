import path from 'node:path';
import { app, openFileInTree, waitForAppReady } from '../../page-objects/app.mjs';

const TAB = (name) => $(`#document-tabs [role="tab"][title$="/${name}"]`);
const TABS = () => $$('#document-tabs [role="tab"]');

async function openTab(name) {
  await TAB(name).waitForDisplayed({ timeout: 10_000 });
  await TAB(name).click();
  await browser.waitUntil(async () => {
    const currentTab = TAB(name);
    return await currentTab.isExisting() && await currentTab.getAttribute('aria-selected') === 'true';
  }, {
    timeout: 10_000,
    timeoutMsg: `Expected ${name} tab to become active`,
  });
}

// The embedded WebDriver's element.click() runs el.click(); el.focus(), without
// mousedown. Model the browser's cancelable default focus action explicitly so
// this regression exercises the same sequence as a user's mouse activation.
async function pointerActivate(tabId) {
  await browser.execute((id) => {
    const tab = document.querySelector(`#document-tabs [data-tab-id="${id}"]`);
    const down = new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true });
    if (tab.dispatchEvent(down)) tab.focus();
    tab.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
    tab.click();
  }, tabId);
  await browser.waitUntil(async () => await $(`#document-tabs [data-tab-id="${tabId}"]`).getAttribute('aria-selected') === 'true', { timeout: 5_000 });
}

// Tab commands arrive from the native menu bar: the OS consumes the accelerator
// and Rust re-emits `menu:action`. The embedded WebDriver cannot press native
// menu accelerators (WebKit also reserves tab-management keys), so drive the
// same bridge instead of synthesising DOM keydown events — the DOM handler no
// longer executes menu commands (keyboard-shortcuts spec).
async function dispatchNativeMenuAction(action) {
  await browser.execute(async (actionId) => {
    await window.__TAURI__.event.emit('menu:action', actionId);
  }, action);
}

export function registerDocumentTabsTests() {
  describe('MarkFlow smoke: document tabs', () => {
    it('keeps three file sessions independent and supports tab shortcuts and close/restore', async () => {
      await waitForAppReady();
      await openFileInTree('welcome.md');
      await openTab('welcome.md');
      const baselineTabCount = (await TABS()).length;

      const alphaFile = $('[data-testid="file-tree-item"][data-path$="/tabs-345-alpha.md"]');
      const betaFile = $('[data-testid="file-tree-item"][data-path$="/tabs-345-beta.md"]');
      await alphaFile.waitForDisplayed({ timeout: 10_000 });
      await betaFile.waitForDisplayed({ timeout: 10_000 });

      await openFileInTree('tabs-345-alpha.md');
      await openTab('tabs-345-alpha.md');
      await openFileInTree('tabs-345-beta.md');
      await openTab('tabs-345-beta.md');
      await browser.waitUntil(async () => (await TABS()).length === baselineTabCount + 2, {
        timeout: 10_000,
        timeoutMsg: 'Expected alpha and beta to add independent document tabs',
      });
      await expect(await TAB('welcome.md')).toBeDisplayed();
      await expect(await TAB('tabs-345-alpha.md')).toBeDisplayed();
      await expect(await TAB('tabs-345-beta.md')).toBeDisplayed();
      await expect(await app.wysiwyg()).toHaveText(expect.stringContaining('Beta original content.'));

      // Edit Alpha in its own session, then verify Beta remains distinct and
      // switching back restores Alpha's unsaved in-memory content.
      await openTab('tabs-345-alpha.md');
      await (await app.sourceMode()).click();
      const source = await app.sourceContent();
      await source.click();
      await source.addValue('\nAlpha unsaved session marker.');
      await expect(source).toHaveText(expect.stringContaining('Alpha unsaved session marker.'));

      await openTab('tabs-345-beta.md');
      await (await app.sourceMode()).click();
      const betaSource = await app.sourceContent();
      await betaSource.click();
      await betaSource.addValue('\nBeta unsaved session marker.');
      await expect(betaSource).toHaveText(expect.stringContaining('Beta unsaved session marker.'));

      // Switching back restores Alpha's unsaved content without changing Beta.
      await openTab('tabs-345-alpha.md');
      await expect(await app.sourceContent()).toHaveText(expect.stringContaining('Alpha unsaved session marker.'));
      await openTab('tabs-345-beta.md');
      await expect(await app.sourceContent()).toHaveText(expect.stringContaining('Beta unsaved session marker.'));

      await openTab('tabs-345-alpha.md');
      await expect(await app.sourceContent()).toHaveText(expect.stringContaining('Alpha unsaved session marker.'));
      await (await app.save()).click();
      await browser.waitUntil(async () => (await TAB('tabs-345-alpha.md').getAttribute('data-dirty')) === 'false', {
        timeout: 10_000, timeoutMsg: 'Expected Alpha to save its own session',
      });
      await openTab('tabs-345-beta.md');
      await expect(await app.sourceContent()).toHaveText(expect.stringContaining('Beta unsaved session marker.'));
      await (await app.save()).click();
      await browser.waitUntil(async () => (await TAB('tabs-345-beta.md').getAttribute('data-dirty')) === 'false', {
        timeout: 10_000, timeoutMsg: 'Expected Beta to save its own session',
      });

      // Ctrl+Tab cycles to the next document and Shift+Ctrl+Tab cycles back.
      await openTab('tabs-345-alpha.md');
      await dispatchNativeMenuAction('next-tab');
      await expect(await TAB('tabs-345-beta.md')).toHaveAttribute('aria-selected', 'true');
      await dispatchNativeMenuAction('previous-tab');
      await expect(await TAB('tabs-345-alpha.md')).toHaveAttribute('aria-selected', 'true');

      // Close a clean document, then reopen its most recently closed session.
      await openTab('tabs-345-beta.md');
      await dispatchNativeMenuAction('close-tab');
      await browser.waitUntil(async () => (await TABS()).length === baselineTabCount + 1, {
        timeout: 10_000,
        timeoutMsg: 'Expected the 关闭标签页 menu action to close the active clean tab',
      });
      await dispatchNativeMenuAction('reopen-tab');
      await browser.waitUntil(async () => (await TABS()).length === baselineTabCount + 2, {
        timeout: 10_000,
        timeoutMsg: 'Expected the 恢复关闭的标签页 menu action to restore the closed tab',
      });
      await expect(await TAB('tabs-345-beta.md')).toBeDisplayed();

      // Ctrl+T opens a new blank document session without replacing the files.
      await dispatchNativeMenuAction('new-tab');
      await browser.waitUntil(async () => (await TABS()).length === baselineTabCount + 3, {
        timeout: 10_000,
        timeoutMsg: 'Expected the 新建标签页 menu action to open a new document tab',
      });
      await browser.saveScreenshot(path.join(process.cwd(), 'e2e', 'artifacts', 'document-tabs.png'));
    });

    it('restores the visible WYSIWYG caret and insertion point when switching from a blank tab', async () => {
      const blankTabId = await $('#document-tabs [role="tab"][aria-selected="true"]').getAttribute('data-tab-id');
      await openTab('tabs-345-beta.md');
      const sourceTabId = await TAB('tabs-345-beta.md').getAttribute('data-tab-id');
      await (await app.sourceMode()).click();
      await (await app.sourceContent()).waitForDisplayed({ timeout: 5_000 });
      await openFileInTree('tabs-348-caret.md');
      const caretTabId = await TAB('tabs-348-caret.md').getAttribute('data-tab-id');
      await browser.execute(() => {
        const editor = document.querySelector('#wysiwyg-editor .tiptap').editor;
        editor.commands.setTextSelection(9);
        editor.view.focus();
      });
      const selection = () => browser.execute(() => {
        const root = document.querySelector('#wysiwyg-editor .tiptap');
        const view = root.editor.view;
        const dom = window.getSelection();
        const inside = node => node && root.contains(node);
        return {
          anchor: view.state.selection.anchor,
          head: view.state.selection.head,
          domAnchor: inside(dom.anchorNode) ? view.posAtDOM(dom.anchorNode, dom.anchorOffset) : null,
          domHead: inside(dom.focusNode) ? view.posAtDOM(dom.focusNode, dom.focusOffset) : null,
          focused: view.hasFocus(),
          status: document.getElementById('cursor-pos').textContent,
        };
      });
      expect(await selection()).toMatchObject({ anchor: 9, head: 9, domAnchor: 9, domHead: 9, focused: true });

      await pointerActivate(blankTabId);
      await browser.waitUntil(async () => (await selection()).anchor === 1, { timeout: 5_000 });
      expect(await selection()).toMatchObject({ anchor: 1, head: 1, domAnchor: 1, domHead: 1 });
      await pointerActivate(caretTabId);
      expect(await selection()).toEqual({ anchor: 9, head: 9, domAnchor: 9, domHead: 9, focused: true, status: '行 1, 列 8' });

      await pointerActivate(sourceTabId);
      expect(await browser.execute(() => Boolean(document.activeElement?.closest('#source-editor-wrapper .cm-content')))).toBe(true);
      await pointerActivate(caretTabId);
      expect(await selection()).toEqual({ anchor: 9, head: 9, domAnchor: 9, domHead: 9, focused: true, status: '行 1, 列 8' });
      await dispatchNativeMenuAction('next-tab');
      await browser.waitUntil(async () => await TAB('tabs-348-caret.md').getAttribute('aria-selected') === 'false', { timeout: 5_000 });
      await dispatchNativeMenuAction('previous-tab');
      await browser.waitUntil(async () => await TAB('tabs-348-caret.md').getAttribute('aria-selected') === 'true', { timeout: 5_000 });
      expect(await selection()).toEqual({ anchor: 9, head: 9, domAnchor: 9, domHead: 9, focused: true, status: '行 1, 列 8' });

      // Text input in the real WebView must use the same location shown by the restored caret.
      await $('#wysiwyg-editor .tiptap').addValue('Z');
      await expect($('#wysiwyg-editor h1')).toHaveText('Alpha doZcument');
      await browser.execute(() => document.querySelector('#wysiwyg-editor .tiptap').editor.commands.undo());
      await expect($('#wysiwyg-editor h1')).toHaveText('Alpha document');
      await browser.saveScreenshot(path.join(process.cwd(), 'e2e', 'artifacts', 'document-tabs-caret.png'));
    });
  });
}
