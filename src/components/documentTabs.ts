import {
  activateDocumentTab,
  closeDocumentTab,
  getActiveTabId,
  getDocumentTabs,
  MAX_DOCUMENT_TABS,
  newDocumentTab,
  onDocumentTabsChanged,
} from '../lib/documentSessions';

type DocumentTab = ReturnType<typeof getDocumentTabs>[number];

function getParentSegments(path: string): string[] {
  return path.replace(/\\/g, '/').split('/').filter(Boolean).slice(0, -1);
}

function getVisibleTitle(tab: DocumentTab, tabs: readonly DocumentTab[]): string {
  const duplicates = tabs.filter(candidate => candidate.title === tab.title);
  if (!tab.path || duplicates.length < 2) return tab.title;

  const parentSegments = getParentSegments(tab.path);
  for (let depth = 1; depth <= parentSegments.length; depth += 1) {
    const suffix = parentSegments.slice(-depth).join('/');
    const isUnique = duplicates.every(candidate => candidate === tab || !candidate.path ||
      getParentSegments(candidate.path).slice(-depth).join('/') !== suffix);
    if (isUnique) return `${suffix} · ${tab.title}`;
  }

  return `${parentSegments.join('/')} · ${tab.title}`;
}

export function initDocumentTabs() {
  const root = document.getElementById('document-tabs');
  const scroll = root?.querySelector<HTMLElement>('[data-tabs-scroll]');
  const listButton = root?.querySelector<HTMLButtonElement>('[data-tabs-list]');
  const list = root?.querySelector<HTMLElement>('[data-tabs-menu]');
  const newButton = root?.querySelector<HTMLButtonElement>('[data-tabs-new]');
  if (!root || !scroll || !newButton) return () => {};

  const render = () => {
    const tabs = getDocumentTabs();
    const activeId = getActiveTabId();
    const focusedTabId = document.activeElement instanceof HTMLElement
      ? document.activeElement.closest<HTMLElement>('[role="tab"][data-tab-id]')?.dataset.tabId
      : undefined;
    const focusActiveTab = document.activeElement === newButton;
    const fragment = document.createDocumentFragment();

    tabs.forEach(tab => {
      const tabItem = document.createElement('div');
      tabItem.className = 'document-tab-item';
      tabItem.dataset.tabItem = tab.id;
      tabItem.dataset.active = String(tab.id === activeId);
      tabItem.setAttribute('role', 'presentation');

      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'document-tab';
      item.dataset.tabId = tab.id;
      item.dataset.dirty = String(tab.dirty);
      item.setAttribute('role', 'tab');
      item.setAttribute('aria-selected', String(tab.id === activeId));
      item.tabIndex = tab.id === activeId ? 0 : -1;
      item.title = tab.path ?? tab.title;

      const dirtySlot = document.createElement('span');
      dirtySlot.className = 'document-tab-dirty-slot';
      dirtySlot.setAttribute('aria-hidden', 'true');
      const dirtyDot = document.createElement('span');
      dirtyDot.className = 'document-tab-dirty-dot';
      dirtySlot.append(dirtyDot);

      const title = document.createElement('span');
      title.className = 'document-tab-title';
      title.textContent = getVisibleTitle(tab, tabs);

      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'document-tab-close';
      close.dataset.closeTab = tab.id;
      close.setAttribute('aria-label', `关闭 ${tab.title}`);
      close.title = `关闭 ${tab.title}`;
      close.innerHTML = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8"/></svg>';

      item.append(dirtySlot, title);
      tabItem.append(item, close);
      fragment.append(tabItem);
    });

    scroll.replaceChildren(fragment);
    if (list) {
      const listFragment = document.createDocumentFragment();
      tabs.forEach(tab => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'document-tabs-menu-item';
        item.dataset.activateTab = tab.id;
        item.setAttribute('role', 'menuitemradio');
        item.setAttribute('aria-checked', String(tab.id === activeId));
        const title = document.createElement('span');
        title.textContent = getVisibleTitle(tab, tabs);
        const dirty = document.createElement('span');
        dirty.className = 'document-tabs-menu-dirty';
        dirty.textContent = tab.dirty ? '●' : '';
        dirty.setAttribute('aria-hidden', 'true');
        item.append(title, dirty);
        listFragment.append(item);
      });
      list.replaceChildren(listFragment);
    }
    newButton.disabled = tabs.length >= MAX_DOCUMENT_TABS;
    newButton.title = newButton.disabled ? '文件已达上限（20）' : '新建标签 (Ctrl+T)';
    const focusId = focusActiveTab ? activeId : focusedTabId;
    if (focusId) {
      Array.from(scroll.querySelectorAll<HTMLElement>('[role="tab"][data-tab-id]'))
        .find(tab => tab.dataset.tabId === focusId)?.focus();
    }
  };

  const unsubscribe = onDocumentTabsChanged(render);
  newButton.addEventListener('click', () => newDocumentTab());

  // Keep an editing surface focused during a mouse tab switch. Otherwise the
  // button takes focus before the session coordinator can transfer the caret.
  // Keyboard navigation still owns its tab-button focus.
  root.addEventListener('mousedown', event => {
    if (event.button !== 0 || !(event.target instanceof Element)) return;
    if (!event.target.closest('[role="tab"][data-tab-id]')) return;
    if (document.activeElement?.closest('#wysiwyg-editor, #source-editor-wrapper')) event.preventDefault();
  });

  root.addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const closeButton = target.closest<HTMLButtonElement>('[data-close-tab]');
    if (closeButton) {
      event.stopPropagation();
      closeDocumentTab(closeButton.dataset.closeTab!);
      return;
    }

    const listToggle = target.closest<HTMLButtonElement>('[data-tabs-list]');
    if (listToggle && list) {
      const isOpen = list.hidden;
      list.hidden = !isOpen;
      listToggle.setAttribute('aria-expanded', String(isOpen));
      return;
    }

    const menuItem = target.closest<HTMLButtonElement>('[data-activate-tab]');
    if (menuItem?.dataset.activateTab) {
      const id = menuItem.dataset.activateTab;
      if (list) list.hidden = true;
      listButton?.setAttribute('aria-expanded', 'false');
      activateDocumentTab(id);
      Array.from(scroll.querySelectorAll<HTMLElement>('[data-tab-id]'))
        .find(tab => tab.dataset.tabId === id)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      return;
    }

    const tab = target.closest<HTMLElement>('[role="tab"][data-tab-id]');
    if (tab?.dataset.tabId) activateDocumentTab(tab.dataset.tabId);
  });

  scroll.addEventListener('wheel', event => {
    const delta = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (delta === 0) return;
    scroll.scrollLeft += delta;
    event.preventDefault();
  }, { passive: false });

  const dismissList = (event: MouseEvent) => {
    if (!list || list.hidden || !(event.target instanceof Node) || root.contains(event.target)) return;
    list.hidden = true;
    listButton?.setAttribute('aria-expanded', 'false');
  };
  document.addEventListener('click', dismissList);

  root.addEventListener('auxclick', event => {
    if (event.button !== 1) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const tabItem = target.closest<HTMLElement>('[data-tab-item]');
    if (!tabItem?.dataset.tabItem) return;
    event.preventDefault();
    closeDocumentTab(tabItem.dataset.tabItem);
  });

  root.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.matches('[role="tab"]')) return;
    const tabNodes = Array.from(scroll.querySelectorAll<HTMLElement>('[role="tab"]'));
    const index = tabNodes.indexOf(target);
    if (index < 0 || tabNodes.length === 0) return;

    let nextIndex = index;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabNodes.length) % tabNodes.length;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabNodes.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabNodes.length - 1;

    event.preventDefault();
    const nextId = tabNodes[nextIndex].dataset.tabId;
    if (!nextId) return;
    activateDocumentTab(nextId);
    Array.from(scroll.querySelectorAll<HTMLElement>('[role="tab"][data-tab-id]'))
      .find(tab => tab.dataset.tabId === nextId)?.focus();
  });

  render();
  return () => {
    unsubscribe();
    document.removeEventListener('click', dismissList);
  };
}
