import path from 'node:path';
import { app, openFileInTree, waitForAppReady } from '../../page-objects/app.mjs';

const TAB = (name) => $(`#document-tabs [role="tab"][title$="/${name}"]`);
const TABS = () => $$('#document-tabs [role="tab"]');
const PRIMARY_MODIFIER = process.platform === 'darwin' ? 'META' : 'CTRL';

async function openTab(name) {
  const tab = TAB(name);
  await tab.waitForDisplayed({ timeout: 10_000 });
  await tab.click();
  await browser.waitUntil(async () => (await tab.getAttribute('aria-selected')) === 'true', {
    timeout: 10_000,
    timeoutMsg: `Expected ${name} tab to become active`,
  });
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

      // Undo in Alpha must only affect Alpha's CodeMirror history.
      await openTab('tabs-345-alpha.md');
      await (await app.sourceContent()).click();
      await browser.keys([PRIMARY_MODIFIER, 'Z']);
      await browser.waitUntil(async () => {
        const text = await (await app.sourceContent()).getText();
        return !text.includes('Alpha unsaved session marker.');
      }, {
        timeout: 10_000,
        timeoutMsg: 'Expected undo in Alpha to remove only Alpha’s edit',
      });
      await openTab('tabs-345-beta.md');
      await expect(await app.sourceContent()).toHaveText(expect.stringContaining('Beta unsaved session marker.'));
      await (await app.sourceContent()).click();
      await browser.keys([PRIMARY_MODIFIER, 'Z']);
      await browser.waitUntil(async () => {
        const text = await (await app.sourceContent()).getText();
        return !text.includes('Beta unsaved session marker.');
      }, {
        timeout: 10_000,
        timeoutMsg: 'Expected undo in Beta to remove Beta’s own edit',
      });

      await openTab('tabs-345-alpha.md');
      await expect(await app.sourceContent()).toHaveText(expect.stringContaining('Alpha original content.'));
      await expect(await app.sourceContent()).not.toHaveText(expect.stringContaining('Alpha unsaved session marker.'));
      await openTab('tabs-345-beta.md');
      await expect(await app.sourceContent()).toHaveText(expect.stringContaining('Beta original content.'));
      await expect(await app.sourceContent()).not.toHaveText(expect.stringContaining('Alpha unsaved session marker.'));
      await expect(await app.sourceContent()).not.toHaveText(expect.stringContaining('Beta unsaved session marker.'));
      await browser.waitUntil(async () =>
        (await TAB('tabs-345-alpha.md').getAttribute('data-dirty')) === 'false'
        && (await TAB('tabs-345-beta.md').getAttribute('data-dirty')) === 'false',
      { timeout: 10_000, timeoutMsg: 'Expected undo to restore both documents to their clean state' });

      // Ctrl+Tab cycles to the next document and Shift+Ctrl+Tab cycles back.
      await browser.keys(['CTRL', 'TAB']);
      await expect(await TAB('tabs-345-beta.md')).toHaveAttribute('aria-selected', 'true');
      await browser.keys(['SHIFT', 'CTRL', 'TAB']);
      await expect(await TAB('tabs-345-alpha.md')).toHaveAttribute('aria-selected', 'true');

      // Close a clean document, then reopen its most recently closed session.
      await openTab('tabs-345-beta.md');
      await browser.keys([PRIMARY_MODIFIER, 'W']);
      await browser.waitUntil(async () => (await TABS()).length === baselineTabCount + 1, {
        timeout: 10_000,
        timeoutMsg: 'Expected Ctrl+W to close the active clean tab',
      });
      await browser.keys(['SHIFT', PRIMARY_MODIFIER, 'T']);
      await browser.waitUntil(async () => (await TABS()).length === baselineTabCount + 2, {
        timeout: 10_000,
        timeoutMsg: 'Expected Ctrl+Shift+T to restore the closed tab',
      });
      await expect(await TAB('tabs-345-beta.md')).toBeDisplayed();

      // Ctrl+T opens a new blank document session without replacing the files.
      await browser.keys([PRIMARY_MODIFIER, 'T']);
      await browser.waitUntil(async () => (await TABS()).length === baselineTabCount + 3, {
        timeout: 10_000,
        timeoutMsg: 'Expected Ctrl+T to open a new document tab',
      });
      await browser.saveScreenshot(path.join(process.cwd(), 'e2e', 'artifacts', 'document-tabs.png'));
    });
  });
}
