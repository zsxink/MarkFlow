import { afterEach, describe, expect, it } from 'vitest';
import { createSourceEditor, destroySourceEditor, getSourceView, setSourceHighlight, setSourceSoftWrap } from './editor.source';
import { highlightingFor } from '@codemirror/language';
import { tags } from '@lezer/highlight';

describe('source editor frontmatter marker', () => {
  afterEach(() => {
    destroySourceEditor();
    document.body.replaceChildren();
  });

  it('marks every line of a complete leading frontmatter block without parsing it as YAML', () => {
    const container = document.createElement('div');
    document.body.append(container);

    createSourceEditor(container, '---\ntag: [你好]\n---\n\n正文');

    const markedLines = container.querySelectorAll('.cm-frontmatter-line');
    expect(markedLines).toHaveLength(3);
    expect(markedLines[1].textContent).toBe('tag: [你好]');
  });

  it('does not mark an incomplete or non-leading delimiter block', () => {
    const container = document.createElement('div');
    document.body.append(container);

    createSourceEditor(container, '# 标题\n---\ntag: test\n---');

    expect(container.querySelector('.cm-frontmatter-line')).toBeNull();
  });

  it('removes an orphaned CodeMirror DOM before mounting the active source view', () => {
    const container = document.createElement('div');
    const orphan = document.createElement('div');
    orphan.className = 'cm-editor';
    orphan.textContent = 'stale document';
    container.append(orphan);
    document.body.append(container);

    createSourceEditor(container, 'current document');

    expect(container.querySelectorAll(':scope > .cm-editor')).toHaveLength(1);
    expect(container.textContent).toContain('current document');
    expect(container.textContent).not.toContain('stale document');
  });

  it('preserves custom Markdown highlighting when settings reapply it', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const view = createSourceEditor(container, '# 标题\n\n**强调**');
    const headingStyle = highlightingFor(view.state, [tags.heading1]);
    expect(headingStyle).toBeTruthy();

    // Opening settings reapplies the current toggle without changing it.
    setSourceHighlight(true);
    expect(highlightingFor(view.state, [tags.heading1])).toBe(headingStyle);

    setSourceHighlight(false);
    expect(highlightingFor(view.state, [tags.heading1])).not.toBe(headingStyle);
    expect(view.dom.classList.contains('no-code-highlight')).toBe(true);
    setSourceHighlight(true);
    expect(highlightingFor(view.state, [tags.heading1])).toBe(headingStyle);
  });
});

describe('source editor soft wrap compartment', () => {
  afterEach(() => {
    destroySourceEditor();
    setSourceSoftWrap(true);
    document.body.replaceChildren();
  });

  it('toggles line wrapping on the live view without recreating it', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const view = createSourceEditor(container, 'x'.repeat(500));

    expect(view.contentDOM.classList.contains('cm-lineWrapping')).toBe(true);

    setSourceSoftWrap(false);
    expect(view.contentDOM.classList.contains('cm-lineWrapping')).toBe(false);
    expect(getSourceView()).toBe(view);
    expect(container.querySelectorAll(':scope > .cm-editor')).toHaveLength(1);

    setSourceSoftWrap(true);
    expect(view.contentDOM.classList.contains('cm-lineWrapping')).toBe(true);
    expect(getSourceView()).toBe(view);
  });

  it('keeps a toggled value for the next session and is a no-op without a view', () => {
    expect(() => setSourceSoftWrap(false)).not.toThrow();
    const container = document.createElement('div');
    document.body.append(container);

    const view = createSourceEditor(container, 'body');

    expect(view.contentDOM.classList.contains('cm-lineWrapping')).toBe(false);
  });
});
