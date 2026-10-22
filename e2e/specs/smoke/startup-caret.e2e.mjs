import path from 'node:path';
import { app, waitForAppReady } from '../../page-objects/app.mjs';

export function registerStartupCaretTests() {
  describe('MarkFlow smoke: first open from the startup blank tab', () => {
    it('clears the startup caret before replacing content and keeps input on the new document', async () => {
      await waitForAppReady();
      const tabs = await $$('#document-tabs [role="tab"]');
      expect(tabs).toHaveLength(1);
      await expect(tabs[0]).toHaveText(expect.stringContaining('未命名'));
      const blankId = await tabs[0].getAttribute('data-tab-id');
      await expect(app.wysiwyg()).toHaveText('');

      await browser.execute(() => {
        const root = document.querySelector('#wysiwyg-editor .tiptap');
        const view = root.editor.view;
        const initialDoc = view.state.doc;
        const updateState = view.updateState;
        window.__startupCaretBoundary = null;
        view.updateState = function (state) {
          if (state.doc !== initialDoc) {
            const selection = window.getSelection();
            window.__startupCaretBoundary = {
              rangeCount: selection.rangeCount,
              outgoingFocused: root.contains(document.activeElement),
            };
            view.updateState = updateState;
          }
          return updateState.call(this, state);
        };
      });

      // Do not call openFileInTree/showFiles here. Its sidebar-button click
      // blurs the startup editor and masks the first-open WebKit paint bug.
      const file = app.fileTreeItem('startup-352-caret.md');
      await file.waitForDisplayed({ timeout: 10_000 });
      await file.click();
      await expect($('#wysiwyg-editor h1')).toHaveText('Skill-Hub');
      expect(await browser.execute(() => window.__startupCaretBoundary)).toEqual({ rangeCount: 0, outgoingFocused: false });
      await expect($(`#document-tabs [data-tab-id="${blankId}"]`)).toBeDisplayed();
      expect(await $$('#document-tabs [role="tab"]')).toHaveLength(2);

      // Embedded WebDriver synthesizes click events without browser caret
      // placement. Assert DOM/model insertion separately; OS mouse clicks and
      // native window screenshots cover stale caret painting outside this test.
      await $('#wysiwyg-editor h1').click();
      await browser.execute(() => {
        const editor = document.querySelector('#wysiwyg-editor .tiptap').editor;
        editor.commands.setTextSelection(10);
        editor.view.focus();
      });
      expect(await browser.execute(() => {
        const root = document.querySelector('#wysiwyg-editor .tiptap');
        const selection = window.getSelection();
        return {
          rangeCount: selection.rangeCount,
          model: root.editor.state.selection.head,
          dom: root.editor.view.posAtDOM(selection.focusNode, selection.focusOffset),
        };
      })).toEqual({ rangeCount: 1, model: 10, dom: 10 });
      await $('#wysiwyg-editor .tiptap').addValue('Z');
      await expect($('#wysiwyg-editor h1')).toHaveText('Skill-HubZ');
      await browser.execute(() => document.querySelector('#wysiwyg-editor .tiptap').editor.commands.undo());
      await expect($('#wysiwyg-editor h1')).toHaveText('Skill-Hub');
      await browser.saveScreenshot(path.join(process.cwd(), 'e2e', 'artifacts', 'startup-caret-dom.png'));
    });
  });
}
