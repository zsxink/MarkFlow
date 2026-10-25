import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCodeBlockToolbar, CODE_BLOCK_LANGUAGES } from '../code-block-toolbar';

function build(overrides: Partial<Parameters<typeof buildCodeBlockToolbar>[0]> = {}) {
  const onCopy = vi.fn();
  const onLanguageChange = vi.fn();
  const toolbar = buildCodeBlockToolbar({
    getLanguage: () => 'typescript',
    getSource: () => 'const a = 1;',
    onCopy,
    onLanguageChange,
    ...overrides,
  });
  return { toolbar, onCopy, onLanguageChange };
}

function clickOutside() {
  document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
}

describe('CODE_BLOCK_LANGUAGES', () => {
  it('places 纯文本 first and excludes diagram languages', () => {
    expect(CODE_BLOCK_LANGUAGES[0]).toEqual({ id: '', label: '纯文本' });
    const ids = CODE_BLOCK_LANGUAGES.map(item => item.id);
    expect(ids).not.toContain('mermaid');
    expect(ids).not.toContain('plantuml');
    expect(ids).not.toContain('puml');
  });
});

describe('buildCodeBlockToolbar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders language label, copy button, and aria attributes', () => {
    const { toolbar } = build();
    const langBtn = toolbar.el.querySelector<HTMLButtonElement>('.code-block-lang-btn');
    const copyBtn = toolbar.el.querySelector<HTMLButtonElement>('.code-block-copy-btn');
    expect(langBtn?.querySelector('.code-block-lang-label')?.textContent).toBe('typescript');
    expect(langBtn?.getAttribute('aria-haspopup')).toBe('listbox');
    expect(langBtn?.getAttribute('aria-expanded')).toBe('false');
    expect(copyBtn?.getAttribute('aria-label')).toBe('复制代码');
    expect(toolbar.el.querySelector<HTMLElement>('.code-block-lang-menu')?.hidden).toBe(true);
  });

  it('shows 纯文本 placeholder when language is empty', () => {
    const { toolbar } = build({ getLanguage: () => '' });
    expect(toolbar.el.querySelector('.code-block-lang-label')?.textContent).toBe('纯文本');
  });

  it('opens the menu on click, lists candidates with current selected', () => {
    const { toolbar } = build();
    const langBtn = toolbar.el.querySelector<HTMLButtonElement>('.code-block-lang-btn')!;
    langBtn.click();
    const menu = toolbar.el.querySelector<HTMLElement>('.code-block-lang-menu')!;
    expect(menu.hidden).toBe(false);
    expect(langBtn.getAttribute('aria-expanded')).toBe('true');
    const selected = menu.querySelector('button[aria-selected="true"]');
    expect(selected?.textContent).toContain('typescript');
    expect(menu.querySelector('.code-block-lang-hint')?.textContent).toBe('未列出的语言将展示为纯文本');
  });

  it('filters by query and offers custom entry for unlisted languages', () => {
    const { toolbar } = build();
    toolbar.el.querySelector<HTMLButtonElement>('.code-block-lang-btn')!.click();
    const input = toolbar.el.querySelector<HTMLInputElement>('.code-block-lang-search input')!;
    input.value = 'purr';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const rows = [...toolbar.el.querySelectorAll('.code-block-lang-list button')];
    expect(rows.map(row => row.textContent)).toEqual(['使用「purr」']);
  });

  it('selects a candidate and notifies onLanguageChange', () => {
    const { toolbar, onLanguageChange } = build();
    toolbar.el.querySelector<HTMLButtonElement>('.code-block-lang-btn')!.click();
    const rows = [...toolbar.el.querySelectorAll<HTMLButtonElement>('.code-block-lang-list button')];
    rows.find(row => row.textContent === 'python')!.click();
    expect(onLanguageChange).toHaveBeenCalledWith('python');
    expect(toolbar.el.querySelector<HTMLElement>('.code-block-lang-menu')?.hidden).toBe(true);
    expect(toolbar.el.querySelector('.code-block-lang-label')?.textContent).toBe('python');
  });

  it('confirms custom language with Enter', () => {
    const { toolbar, onLanguageChange } = build();
    toolbar.el.querySelector<HTMLButtonElement>('.code-block-lang-btn')!.click();
    const input = toolbar.el.querySelector<HTMLInputElement>('.code-block-lang-search input')!;
    input.value = 'purr';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onLanguageChange).toHaveBeenCalledWith('purr');
  });

  it('closes on Escape and returns focus to the language button', () => {
    const { toolbar } = build();
    document.body.append(toolbar.el);
    try {
      const langBtn = toolbar.el.querySelector<HTMLButtonElement>('.code-block-lang-btn')!;
      langBtn.click();
      const input = toolbar.el.querySelector<HTMLInputElement>('.code-block-lang-search input')!;
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(toolbar.el.querySelector<HTMLElement>('.code-block-lang-menu')?.hidden).toBe(true);
      expect(langBtn.getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(langBtn);
    } finally {
      toolbar.el.remove();
    }
  });

  it('closes on outside mousedown', () => {
    const { toolbar } = build();
    toolbar.el.querySelector<HTMLButtonElement>('.code-block-lang-btn')!.click();
    expect(toolbar.el.querySelector<HTMLElement>('.code-block-lang-menu')?.hidden).toBe(false);
    clickOutside();
    expect(toolbar.el.querySelector<HTMLElement>('.code-block-lang-menu')?.hidden).toBe(true);
  });

  it('copies source with feedback first and restores after timeout', () => {
    const { toolbar, onCopy } = build();
    const copyBtn = toolbar.el.querySelector<HTMLButtonElement>('.code-block-copy-btn')!;
    copyBtn.click();
    expect(onCopy).toHaveBeenCalledWith('const a = 1;');
    expect(copyBtn.classList.contains('is-copied')).toBe(true);
    expect(copyBtn.getAttribute('aria-label')).toBe('已复制');
    expect(copyBtn.querySelector('svg path')?.getAttribute('d')).toContain('9 17');
    vi.advanceTimersByTime(1300);
    expect(copyBtn.classList.contains('is-copied')).toBe(false);
    expect(copyBtn.getAttribute('aria-label')).toBe('复制代码');
  });

  it('syncLanguage updates the label in place', () => {
    const { toolbar } = build();
    toolbar.syncLanguage('go');
    expect(toolbar.el.querySelector('.code-block-lang-label')?.textContent).toBe('go');
  });

  it('containsTarget only matches nodes inside the toolbar', () => {
    const { toolbar } = build();
    const copyBtn = toolbar.el.querySelector('.code-block-copy-btn')!;
    expect(toolbar.containsTarget(copyBtn)).toBe(true);
    expect(toolbar.containsTarget(document.body)).toBe(false);
    expect(toolbar.containsTarget(undefined)).toBe(false);
  });

  it('destroy removes the outside-mousedown listener', () => {
    const { toolbar } = build();
    toolbar.el.querySelector<HTMLButtonElement>('.code-block-lang-btn')!.click();
    toolbar.destroy();
    clickOutside();
    // Listener 已卸载：菜单保持打开（由调用方负责后续清理）
    expect(toolbar.el.querySelector<HTMLElement>('.code-block-lang-menu')?.hidden).toBe(false);
  });
});
