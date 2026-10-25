/**
 * WYSIWYG 普通代码块右上角幽灵工具条（#415）：语言下拉切换 + 一键复制。
 * 方案 C「幽灵轻量」：无边框纯文字语言标签 + 幽灵复制按钮，悬停块淡入。
 * 本文件属于 editor 层，禁止 import ui；用户可见反馈只用纯 DOM。
 */

export interface CodeBlockToolbarOptions {
  /** 当前语言（空串表示无语言 → 显示「纯文本」） */
  getLanguage: () => string;
  /** 当前块源码纯文本（复制内容，避免取到高亮 span） */
  getSource: () => string;
  /** 复制动作（剪贴板写入由 NodeView 注入，含兜底） */
  onCopy: (source: string) => void;
  /** 语言切换（value 为空串表示清除语言） */
  onLanguageChange: (value: string) => void;
}

export interface CodeBlockToolbar {
  el: HTMLElement;
  /** 语言 attr 变化后同步标签文案 */
  syncLanguage: (language: string) => void;
  /** stopEvent 用：事件目标是否落在工具条（含下拉）内 */
  containsTarget: (target: unknown) => boolean;
  /** NodeView destroy 时卸载 document 监听与还原定时器 */
  destroy: () => void;
}

/** 下拉候选：lowlight `common` 常用子集，「纯文本」置顶；不含 mermaid/plantuml（图表块不挂工具条）。 */
export const CODE_BLOCK_LANGUAGES: ReadonlyArray<{ id: string; label: string }> = [
  { id: '', label: '纯文本' },
  { id: 'bash', label: 'bash' },
  { id: 'c', label: 'c' },
  { id: 'cpp', label: 'cpp' },
  { id: 'csharp', label: 'csharp' },
  { id: 'css', label: 'css' },
  { id: 'diff', label: 'diff' },
  { id: 'go', label: 'go' },
  { id: 'java', label: 'java' },
  { id: 'javascript', label: 'javascript' },
  { id: 'json', label: 'json' },
  { id: 'kotlin', label: 'kotlin' },
  { id: 'markdown', label: 'markdown' },
  { id: 'php', label: 'php' },
  { id: 'python', label: 'python' },
  { id: 'ruby', label: 'ruby' },
  { id: 'rust', label: 'rust' },
  { id: 'shell', label: 'shell' },
  { id: 'sql', label: 'sql' },
  { id: 'swift', label: 'swift' },
  { id: 'typescript', label: 'typescript' },
  { id: 'xml', label: 'xml' },
  { id: 'yaml', label: 'yaml' },
];

/** 与 image-preview.ts 同一图标 idiom：viewBox 24 / stroke 1.75 / 圆角线帽。 */
const ICON_COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
const ICON_CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const ICON_SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>';

const COPY_FEEDBACK_MS = 1200;

function languageLabel(language: string): string {
  if (!language) return '纯文本';
  const hit = CODE_BLOCK_LANGUAGES.find(item => item.id === language.toLowerCase());
  return hit ? hit.label : language;
}

export function buildCodeBlockToolbar(options: CodeBlockToolbarOptions): CodeBlockToolbar {
  let currentLanguage = options.getLanguage();
  let currentQuery = '';
  let copyRestoreTimer: ReturnType<typeof setTimeout> | undefined;

  const el = document.createElement('div');
  el.className = 'code-block-toolbar';

  const anchor = document.createElement('div');
  anchor.className = 'code-block-lang-anchor';

  const langButton = document.createElement('button');
  langButton.type = 'button';
  langButton.className = 'code-block-lang-btn';
  langButton.setAttribute('aria-haspopup', 'listbox');
  langButton.setAttribute('aria-expanded', 'false');
  const langLabel = document.createElement('span');
  langLabel.className = 'code-block-lang-label';
  langLabel.textContent = languageLabel(currentLanguage);
  langButton.append(langLabel);
  const chevronHolder = document.createElement('span');
  chevronHolder.className = 'code-block-lang-chevron';
  chevronHolder.innerHTML = ICON_CHEVRON;
  langButton.append(chevronHolder);

  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.className = 'code-block-copy-btn';
  copyButton.setAttribute('aria-label', '复制代码');
  copyButton.title = '复制代码';
  copyButton.innerHTML = ICON_COPY;

  const menu = document.createElement('div');
  menu.className = 'code-block-lang-menu';
  menu.hidden = true;

  const searchWrap = document.createElement('div');
  searchWrap.className = 'code-block-lang-search';
  const searchIconHolder = document.createElement('span');
  searchIconHolder.className = 'code-block-lang-search-icon';
  searchIconHolder.innerHTML = ICON_SEARCH;
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = '搜索或输入语言…';
  searchInput.setAttribute('aria-label', '搜索语言');
  searchWrap.append(searchIconHolder, searchInput);

  const list = document.createElement('ul');
  list.className = 'code-block-lang-list';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', '语言列表');

  const hint = document.createElement('div');
  hint.className = 'code-block-lang-hint';
  hint.textContent = '未列出的语言将展示为纯文本';

  menu.append(searchWrap, list, hint);
  anchor.append(langButton, menu);
  el.append(anchor, copyButton);

  const closeMenu = () => {
    menu.hidden = true;
    el.classList.remove('is-open');
    langButton.setAttribute('aria-expanded', 'false');
  };

  const openMenu = () => {
    closeAllMenus();
    menu.hidden = false;
    el.classList.add('is-open');
    langButton.setAttribute('aria-expanded', 'true');
    searchInput.value = '';
    currentQuery = '';
    renderList();
    searchInput.focus();
  };

  const choose = (value: string) => {
    currentLanguage = value;
    langLabel.textContent = languageLabel(value);
    closeMenu();
    options.onLanguageChange(value);
  };

  const renderList = () => {
    const query = currentQuery.trim().toLowerCase();
    list.replaceChildren();
    const matches = CODE_BLOCK_LANGUAGES.filter(item =>
      !query || item.label.toLowerCase().includes(query) || item.id.includes(query));
    const hasExact = matches.some(item => item.id === query || item.label.toLowerCase() === query);

    const appendRow = (id: string, label: string) => {
      const row = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'option');
      if (id === currentLanguage.toLowerCase()) button.setAttribute('aria-selected', 'true');
      const text = document.createElement('span');
      text.textContent = label;
      button.append(text);
      if (id === currentLanguage.toLowerCase()) {
        const checkHolder = document.createElement('span');
        checkHolder.className = 'code-block-lang-check';
        checkHolder.innerHTML = ICON_CHECK;
        button.append(checkHolder);
      }
      button.addEventListener('click', () => choose(id));
      row.append(button);
      list.append(row);
    };

    if (query && !hasExact) appendRow(query, `使用「${query}」`);
    matches.forEach(item => appendRow(item.id, item.label));
  };

  langButton.addEventListener('click', () => {
    if (menu.hidden) openMenu(); else closeMenu();
  });

  searchInput.addEventListener('input', () => {
    currentQuery = searchInput.value;
    renderList();
  });

  searchInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      list.querySelector<HTMLButtonElement>('li button')?.click();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
      langButton.focus();
    }
  });

  copyButton.addEventListener('click', () => {
    // 反馈先行：剪贴板写入成败不影响 ✓ 展示（兜底在 onCopy 注入侧）。
    copyButton.classList.add('is-copied');
    copyButton.setAttribute('aria-label', '已复制');
    copyButton.title = '已复制';
    copyButton.innerHTML = ICON_CHECK;
    clearTimeout(copyRestoreTimer);
    copyRestoreTimer = setTimeout(() => {
      copyButton.classList.remove('is-copied');
      copyButton.setAttribute('aria-label', '复制代码');
      copyButton.title = '复制代码';
      copyButton.innerHTML = ICON_COPY;
    }, COPY_FEEDBACK_MS);
    options.onCopy(options.getSource());
  });

  const containsTarget = (target: unknown) =>
    target instanceof Node && el.contains(target);

  const handleOutsideMouseDown = (event: MouseEvent) => {
    if (menu.hidden) return;
    const target = event.target;
    if (!(target instanceof Node) || el.contains(target)) return;
    closeMenu();
  };
  document.addEventListener('mousedown', handleOutsideMouseDown);

  return {
    el,
    syncLanguage(language: string) {
      currentLanguage = language;
      langLabel.textContent = languageLabel(language);
    },
    containsTarget,
    destroy() {
      document.removeEventListener('mousedown', handleOutsideMouseDown);
      clearTimeout(copyRestoreTimer);
    },
  };
}

/** 关闭当前文档内所有代码块语言下拉（一次只开一个）。 */
function closeAllMenus() {
  document.querySelectorAll('.code-block-toolbar.is-open').forEach(toolbar => {
    if (!(toolbar instanceof HTMLElement)) return;
    const menuEl = toolbar.querySelector<HTMLElement>('.code-block-lang-menu');
    if (menuEl) menuEl.hidden = true;
    toolbar.classList.remove('is-open');
    toolbar.querySelector('.code-block-lang-btn')?.setAttribute('aria-expanded', 'false');
  });
}
