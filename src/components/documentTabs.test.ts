import { beforeEach, describe, expect, it, vi } from 'vitest';

const sessions = vi.hoisted(() => ({
  tabs: [
    { id: 'a', path: '/notes/one/README.md', dirty: true, title: 'README.md' },
    { id: 'b', path: '/projects/two/README.md', dirty: false, title: 'README.md' },
    { id: 'c', path: null, dirty: false, title: 'untitled.md' },
  ] as { id: string; path: string | null; dirty: boolean; title: string }[],
  activeId: 'a' as string | null,
  listener: null as (() => void) | null,
  activateDocumentTab: vi.fn(),
  closeDocumentTab: vi.fn(),
  newDocumentTab: vi.fn(),
}));

vi.mock('../lib/documentSessions', () => ({
  MAX_DOCUMENT_TABS: 20,
  getDocumentTabs: () => sessions.tabs,
  getActiveTabId: () => sessions.activeId,
  activateDocumentTab: sessions.activateDocumentTab,
  closeDocumentTab: sessions.closeDocumentTab,
  newDocumentTab: sessions.newDocumentTab,
  onDocumentTabsChanged: (callback: () => void) => {
    sessions.listener = callback;
    return () => { sessions.listener = null; };
  },
}));

import { initDocumentTabs } from './documentTabs';

describe('initDocumentTabs', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="document-tabs" role="tablist"><div data-tabs-scroll></div><button data-tabs-new></button></div>';
    sessions.tabs = [
      { id: 'a', path: '/notes/one/README.md', dirty: true, title: 'README.md' },
      { id: 'b', path: '/projects/two/README.md', dirty: false, title: 'README.md' },
      { id: 'c', path: null, dirty: false, title: 'untitled.md' },
    ];
    sessions.activeId = 'a';
    sessions.listener = null;
    sessions.activateDocumentTab.mockReset();
    sessions.closeDocumentTab.mockReset();
    sessions.newDocumentTab.mockReset();
  });

  it('renders accessible tabs with fixed dirty slots and same-name parent paths', () => {
    initDocumentTabs();
    const tabs = [...document.querySelectorAll<HTMLElement>('[role="tab"]')];

    expect(tabs).toHaveLength(3);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs[0].tabIndex).toBe(0);
    expect(tabs[1].tabIndex).toBe(-1);
    expect(tabs[0].title).toBe('/notes/one/README.md');
    expect(tabs[0].querySelector('.document-tab-title')?.textContent).toBe('one · README.md');
    expect(tabs[1].querySelector('.document-tab-title')?.textContent).toBe('two · README.md');
    expect(tabs[0].dataset.dirty).toBe('true');
    expect(tabs[0].querySelector('.document-tab-dirty-slot')).toBeTruthy();
  });

  it('activates with arrow keys and focuses the newly active tab', () => {
    initDocumentTabs();
    const firstTab = document.querySelector<HTMLElement>('[data-tab-id="a"]')!;
    firstTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    expect(sessions.activateDocumentTab).toHaveBeenCalledWith('b');
    expect(document.activeElement?.getAttribute('data-tab-id')).toBe('b');
  });

  it('preserves editing focus for primary mouse switches while leaving keyboard tab focus intact', () => {
    initDocumentTabs();
    const editor = document.createElement('div');
    editor.id = 'wysiwyg-editor';
    editor.tabIndex = 0;
    document.body.append(editor);
    const tab = document.querySelector<HTMLElement>('[data-tab-id="b"]')!;
    editor.focus();
    const pointer = new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true });
    tab.dispatchEvent(pointer);
    expect(pointer.defaultPrevented).toBe(true);

    tab.focus();
    const keyboardOwned = new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true });
    tab.dispatchEvent(keyboardOwned);
    expect(keyboardOwned.defaultPrevented).toBe(false);

    editor.focus();
    const middle = new MouseEvent('mousedown', { button: 1, bubbles: true, cancelable: true });
    tab.dispatchEvent(middle);
    expect(middle.defaultPrevented).toBe(false);
  });

  it('closes by button or middle click and creates a tab from the fixed plus button', () => {
    initDocumentTabs();
    document.querySelector<HTMLButtonElement>('[data-close-tab="b"]')!.click();
    const middleClick = new MouseEvent('auxclick', { button: 1, bubbles: true, cancelable: true });
    document.querySelector('[data-tab-id="a"]')!.dispatchEvent(middleClick);
    document.querySelector<HTMLButtonElement>('[data-tabs-new]')!.click();

    expect(sessions.closeDocumentTab.mock.calls).toEqual([['b'], ['a']]);
    expect(middleClick.defaultPrevented).toBe(true);
    expect(sessions.newDocumentTab).toHaveBeenCalledOnce();
  });

  it('updates from session notifications and disables adding at the twenty-tab limit', () => {
    initDocumentTabs();
    sessions.tabs = Array.from({ length: 20 }, (_, index) => ({
      id: String(index), path: `/docs/${index}.md`, dirty: false, title: `${index}.md`,
    }));
    sessions.activeId = '9';
    sessions.listener?.();

    expect(document.querySelectorAll('[role="tab"]')).toHaveLength(20);
    expect(document.querySelector<HTMLButtonElement>('[data-tabs-new]')?.disabled).toBe(true);
  });
});
