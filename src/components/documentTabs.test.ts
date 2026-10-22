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
    document.body.innerHTML = '<div id="document-tabs" role="tablist"><div data-tabs-scroll></div><button data-tabs-new></button><div class="document-tabs-list-wrap"><button data-tabs-list aria-haspopup="menu" aria-controls="document-tabs-menu" aria-expanded="false"></button><div id="document-tabs-menu" data-tabs-menu role="menu" hidden></div></div></div>';
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
    sessions.tabs = Array.from({ length: 19 }, (_, index) => ({
      id: String(index), path: `/docs/${index}.md`, dirty: false, title: `${index}.md`,
    }));
    sessions.activeId = '9';
    sessions.listener?.();
    expect(document.querySelectorAll('[role="tab"]')).toHaveLength(19);
    expect(document.querySelector<HTMLButtonElement>('[data-tabs-new]')?.disabled).toBe(false);

    // The 20th tab is the last one the product allows; the requirement pins the
    // number, so assert it directly instead of echoing the implementation.
    sessions.tabs = Array.from({ length: 20 }, (_, index) => ({
      id: String(index), path: `/docs/${index}.md`, dirty: false, title: `${index}.md`,
    }));
    sessions.listener?.();

    expect(document.querySelectorAll('[role="tab"]')).toHaveLength(20);
    expect(document.querySelector<HTMLButtonElement>('[data-tabs-new]')?.disabled).toBe(true);
    expect(document.querySelector<HTMLButtonElement>('[data-tabs-new]')?.title).toContain('20');
  });

  it('scrolls the strip sideways with the wheel and leaves page scrolling alone', () => {
    initDocumentTabs();
    const scroll = document.querySelector<HTMLElement>('[data-tabs-scroll]')!;
    // jsdom has no layout, so drive the overflow geometry explicitly.
    Object.defineProperty(scroll, 'scrollWidth', { value: 800, configurable: true });
    Object.defineProperty(scroll, 'clientWidth', { value: 200, configurable: true });

    const down = new WheelEvent('wheel', { deltaY: 60, bubbles: true, cancelable: true });
    scroll.dispatchEvent(down);
    expect(scroll.scrollLeft).toBe(60);
    expect(down.defaultPrevented).toBe(true);

    // At the far end there is nothing left to scroll, so the page keeps it.
    scroll.scrollLeft = 600;
    const atEnd = new WheelEvent('wheel', { deltaY: 60, bubbles: true, cancelable: true });
    scroll.dispatchEvent(atEnd);
    expect(scroll.scrollLeft).toBe(600);
    expect(atEnd.defaultPrevented).toBe(false);
  });

  it('does not hijack the wheel when every tab already fits', () => {
    initDocumentTabs();
    const scroll = document.querySelector<HTMLElement>('[data-tabs-scroll]')!;
    Object.defineProperty(scroll, 'scrollWidth', { value: 200, configurable: true });
    Object.defineProperty(scroll, 'clientWidth', { value: 200, configurable: true });

    const wheel = new WheelEvent('wheel', { deltaY: 60, bubbles: true, cancelable: true });
    scroll.dispatchEvent(wheel);
    expect(scroll.scrollLeft).toBe(0);
    expect(wheel.defaultPrevented).toBe(false);
  });

  it('lists open documents and activates the chosen one', () => {
    initDocumentTabs();
    const toggle = document.querySelector<HTMLButtonElement>('[data-tabs-list]')!;
    const menu = document.querySelector<HTMLElement>('[data-tabs-menu]')!;

    toggle.click();
    expect(menu.hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const items = [...menu.querySelectorAll<HTMLButtonElement>('[data-activate-tab]')];
    expect(items.map(item => item.dataset.activateTab)).toEqual(['a', 'b', 'c']);
    expect(items[0].getAttribute('aria-checked')).toBe('true');
    expect(items[1].getAttribute('aria-checked')).toBe('false');
    expect(items[0].textContent).toContain('one · README.md');

    items[1].click();
    expect(sessions.activateDocumentTab).toHaveBeenCalledWith('b');
    expect(menu.hidden).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    // Clicking a tab while the list is open must also dismiss it.
    toggle.click();
    expect(menu.hidden).toBe(false);
    document.querySelector<HTMLElement>('[role="tab"][data-tab-id="c"]')!.click();
    expect(menu.hidden).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(sessions.activateDocumentTab).toHaveBeenLastCalledWith('c');
  });

  it('supports keyboard menu navigation and Escape, and dismisses on outside clicks', () => {
    initDocumentTabs();
    const toggle = document.querySelector<HTMLButtonElement>('[data-tabs-list]')!;
    const menu = document.querySelector<HTMLElement>('[data-tabs-menu]')!;
    const key = (target: Element, name: string) => {
      const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      return event;
    };

    expect(key(toggle, 'ArrowDown').defaultPrevented).toBe(true);
    expect(menu.hidden).toBe(false);
    // Opening focuses the checked item, so arrows move relative to it.
    expect(document.activeElement?.getAttribute('data-activate-tab')).toBe('a');

    expect(key(document.activeElement!, 'ArrowDown').defaultPrevented).toBe(true);
    expect(document.activeElement?.getAttribute('data-activate-tab')).toBe('b');
    expect(key(document.activeElement!, 'ArrowUp').defaultPrevented).toBe(true);
    expect(document.activeElement?.getAttribute('data-activate-tab')).toBe('a');
    expect(key(document.activeElement!, 'End').defaultPrevented).toBe(true);
    expect(document.activeElement?.getAttribute('data-activate-tab')).toBe('c');
    expect(key(document.activeElement!, 'Home').defaultPrevented).toBe(true);
    expect(document.activeElement?.getAttribute('data-activate-tab')).toBe('a');
    expect(key(document.activeElement!, 'ArrowUp').defaultPrevented).toBe(true);
    expect(document.activeElement?.getAttribute('data-activate-tab')).toBe('c');

    expect(key(document.activeElement!, 'Escape').defaultPrevented).toBe(true);
    expect(menu.hidden).toBe(true);
    expect(document.activeElement).toBe(toggle);

    toggle.click();
    expect(menu.hidden).toBe(false);
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(menu.hidden).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it.each(['Enter', ' '])('opens the document list from the trigger with %s', name => {
    initDocumentTabs();
    const toggle = document.querySelector<HTMLButtonElement>('[data-tabs-list]')!;
    const menu = document.querySelector<HTMLElement>('[data-tabs-menu]')!;
    const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
    toggle.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(menu.hidden).toBe(false);
    expect(document.activeElement?.getAttribute('data-activate-tab')).toBe('a');
  });

  it('removes every listener it registered when disposed', () => {
    const dispose = initDocumentTabs();
    const scroll = document.querySelector<HTMLElement>('[data-tabs-scroll]')!;
    Object.defineProperty(scroll, 'scrollWidth', { value: 800, configurable: true });
    Object.defineProperty(scroll, 'clientWidth', { value: 200, configurable: true });
    const editor = document.createElement('div');
    editor.id = 'wysiwyg-editor';
    editor.tabIndex = 0;
    document.body.append(editor);
    editor.focus();

    dispose();
    // A stale handler would still fire after disposal; every registration this
    // module makes is exercised here so a missing removeEventListener fails.
    document.querySelector<HTMLButtonElement>('[data-tabs-new]')!.click();
    document.querySelector<HTMLButtonElement>('[data-close-tab="b"]')!.click();
    document.querySelector<HTMLElement>('[data-tab-id="a"]')!
      .dispatchEvent(new MouseEvent('auxclick', { button: 1, bubbles: true, cancelable: true }));
    document.querySelector<HTMLElement>('[data-tab-id="a"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    document.querySelector<HTMLButtonElement>('[data-tabs-list]')!.click();

    // The wheel handler would hijack the gesture if it survived disposal.
    const wheel = new WheelEvent('wheel', { deltaY: 60, bubbles: true, cancelable: true });
    scroll.dispatchEvent(wheel);
    // The mousedown guard would keep suppressing default if it survived.
    const pointer = new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true });
    document.querySelector<HTMLElement>('[data-tab-id="a"]')!.dispatchEvent(pointer);

    expect(sessions.newDocumentTab).not.toHaveBeenCalled();
    expect(sessions.closeDocumentTab).not.toHaveBeenCalled();
    expect(sessions.activateDocumentTab).not.toHaveBeenCalled();
    expect(scroll.scrollLeft).toBe(0);
    expect(wheel.defaultPrevented).toBe(false);
    expect(pointer.defaultPrevented).toBe(false);
    expect(document.querySelector<HTMLElement>('[data-tabs-menu]')!.hidden).toBe(true);
    // The session subscription must be released too.
    expect(sessions.listener).toBeNull();
  });
});
