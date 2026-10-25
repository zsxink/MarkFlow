import { describe, expect, it } from 'vitest';
import { cleanupEditorMarkup } from '../snapshot';

function buildCodeBlockFragment(): { fragment: DocumentFragment; toolbar: HTMLElement } {
  const fragment = document.createDocumentFragment();
  const wrap = document.createElement('div');
  wrap.className = 'code-block-view';
  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.textContent = 'const a = 1;';
  const toolbar = document.createElement('div');
  toolbar.className = 'code-block-toolbar';
  const langBtn = document.createElement('button');
  langBtn.className = 'code-block-lang-btn';
  langBtn.textContent = 'typescript';
  toolbar.append(langBtn);
  wrap.append(pre, toolbar);
  pre.append(code);
  fragment.append(wrap);
  return { fragment, toolbar };
}

describe('cleanupEditorMarkup', () => {
  it('strips the WYSIWYG code block toolbar but keeps code content', () => {
    const { fragment } = buildCodeBlockFragment();
    cleanupEditorMarkup(fragment);
    expect(fragment.querySelector('.code-block-toolbar')).toBeNull();
    expect(fragment.querySelector('pre code')?.textContent).toBe('const a = 1;');
  });
});
