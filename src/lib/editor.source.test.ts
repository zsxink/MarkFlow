import { afterEach, describe, expect, it } from 'vitest';
import { createSourceEditor, destroySourceEditor } from './editor.source';

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
});
