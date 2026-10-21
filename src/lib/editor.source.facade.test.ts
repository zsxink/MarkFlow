import { afterEach, describe, expect, it } from 'vitest';
import {
  createSourceEditor,
  destroySourceEditor,
  getSourceContent,
  setSourceContent,
} from './editor.source.facade';

describe('source editor lazy facade', () => {
  afterEach(() => {
    destroySourceEditor();
    document.body.replaceChildren();
  });

  it('uses source content changed while the CodeMirror chunk is loading', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const pendingView = createSourceEditor(container, 'previous document');
    setSourceContent('current document');

    const view = await pendingView;
    expect(view?.state.doc.toString()).toBe('current document');
    expect(getSourceContent()).toBe('current document');
  });

  it('does not mount a view after the pending source-mode request is cancelled', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const pendingView = createSourceEditor(container, 'cancelled document');
    destroySourceEditor();

    expect(await pendingView).toBeNull();
    expect(container.querySelector('.cm-editor')).toBeNull();
  });
});
