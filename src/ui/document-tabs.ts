import {
  activateDocumentTab,
  closeAllDocumentTabs,
  closeDocumentTab,
  getActiveTabId,
  getDocumentTabs,
  MAX_DOCUMENT_TABS,
  newDocumentTab,
  onDocumentTabsChanged,
} from './documents/session';
import { shortcutLabel } from './shortcut-hints';

type DocumentTab = ReturnType<typeof getDocumentTabs>[number];

function getParentSegments(path: string): string[] {
  return path.replace(/\\/g, '/').split('/').filter(Boolean).slice(0, -1);
}

export interface TabStripScrollGeometry {
  /** 活动标签左边缘在滚动内容坐标系中的位置（offsetLeft 减去容器自身 offsetLeft）。 */
  tabOffsetLeft: number;
  /** 活动标签整体外沿宽度（含关闭按钮）。 */
  tabOffsetWidth: number;
  /** 滚动容器当前 scrollLeft。 */
  scrollLeft: number;
  /** 滚动容器可视宽度。 */
  clientWidth: number;
}

/**
 * `inline: "nearest"` 语义的最小滚动量：活动标签左越界则左对齐、右越界则
 * 右对齐，已完整可见时保持原值。纯几何计算，便于无 DOM 单测；标签宽于
 * 容器时永远无法完整可见，左分支优先保证看到标签开头。
 */
export function computeActiveTabScrollLeft(geometry: TabStripScrollGeometry): number {
  const { tabOffsetLeft, tabOffsetWidth, scrollLeft, clientWidth } = geometry;
  if (tabOffsetLeft < scrollLeft) return tabOffsetLeft;
  const tabRight = tabOffsetLeft + tabOffsetWidth;
  if (tabRight > scrollLeft + clientWidth) return tabRight - clientWidth;
  return scrollLeft;
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
    // replaceChildren 整体重建滚动容器子节点，浏览器可能把 scrollLeft 归零，
    // 渲染前先记下，重建后恢复，避免无关刷新（如脏状态变化）引起跳变。
    const previousScrollLeft = scroll.scrollLeft;
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
    scroll.scrollLeft = previousScrollLeft;
    const activeItem = scroll.querySelector<HTMLElement>('[data-tab-item][data-active="true"]');
    if (activeItem) {
      // 标签条左侧是可调宽度的 sidebar，tabItem 的 offsetLeft 相对 offsetParent
      // （body）计量，需减去滚动容器自身 offsetLeft 才得到可与 scrollLeft 比较
      // 的内容坐标；固定按钮是滚动容器的兄弟节点，scrollLeft 不会把标签滚到按钮下面。
      scroll.scrollLeft = computeActiveTabScrollLeft({
        tabOffsetLeft: activeItem.offsetLeft - scroll.offsetLeft,
        tabOffsetWidth: activeItem.offsetWidth,
        scrollLeft: scroll.scrollLeft,
        clientWidth: scroll.clientWidth,
      });
    }
    if (list) {
      const listFragment = document.createDocumentFragment();
      const closeAll = document.createElement('button');
      closeAll.type = 'button';
      closeAll.className = 'document-tabs-menu-item document-tabs-menu-action';
      closeAll.dataset.closeAllTabs = '';
      closeAll.setAttribute('role', 'menuitem');
      closeAll.textContent = '全部关闭';
      closeAll.disabled = tabs.length === 0;
      listFragment.append(closeAll);

      const divider = document.createElement('div');
      divider.className = 'document-tabs-menu-divider';
      divider.setAttribute('role', 'separator');
      listFragment.append(divider);

      tabs.forEach(tab => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'document-tabs-menu-item';
        item.dataset.activateTab = tab.id;
        item.setAttribute('role', 'menuitemradio');
        item.setAttribute('aria-checked', String(tab.id === activeId));
        const title = document.createElement('span');
        title.className = 'document-tabs-menu-title';
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
    newButton.title = newButton.disabled ? `文件已达上限（${MAX_DOCUMENT_TABS}）` : `新建标签 (${shortcutLabel('Mod+T')})`;
    const focusId = focusActiveTab ? activeId : focusedTabId;
    if (focusId) {
      Array.from(scroll.querySelectorAll<HTMLElement>('[role="tab"][data-tab-id]'))
        .find(tab => tab.dataset.tabId === focusId)?.focus();
    }
  };

  const menuItems = () => Array.from(list?.querySelectorAll<HTMLButtonElement>('[data-activate-tab], [data-close-all-tabs]') ?? []);
  const openList = () => {
    if (!list) return;
    list.hidden = false;
    listButton?.setAttribute('aria-expanded', 'true');
    // Move focus into the menu so arrow keys work immediately after opening.
    const items = menuItems();
    (items.find(item => item.getAttribute('aria-checked') === 'true') ?? items[0])?.focus();
  };
  const closeList = (restoreFocus = false) => {
    if (!list || list.hidden) return;
    list.hidden = true;
    listButton?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) listButton?.focus();
  };

  const unsubscribe = onDocumentTabsChanged(render);
  const onNewTab = () => { newDocumentTab(); };
  newButton.addEventListener('click', onNewTab);

  // Keep an editing surface focused during a mouse tab switch. Otherwise the
  // button takes focus before the session coordinator can transfer the caret.
  // Keyboard navigation still owns its tab-button focus.
  const onMouseDown = (event: MouseEvent) => {
    if (event.button !== 0 || !(event.target instanceof Element)) return;
    if (!event.target.closest('[role="tab"][data-tab-id]')) return;
    if (document.activeElement?.closest('#wysiwyg-editor, #source-editor-wrapper')) event.preventDefault();
  };
  root.addEventListener('mousedown', onMouseDown);

  const onClick = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const closeButton = target.closest<HTMLButtonElement>('[data-close-tab]');
    if (closeButton) {
      event.stopPropagation();
      closeDocumentTab(closeButton.dataset.closeTab!);
      return;
    }

    const listToggle = target.closest<HTMLButtonElement>('[data-tabs-list]');
    if (listToggle) {
      if (list?.hidden) openList();
      else closeList();
      return;
    }

    const closeAllButton = target.closest<HTMLButtonElement>('[data-close-all-tabs]');
    if (closeAllButton) {
      closeList();
      void closeAllDocumentTabs();
      return;
    }

    const menuItem = target.closest<HTMLButtonElement>('[data-activate-tab]');
    if (menuItem?.dataset.activateTab) {
      closeList();
      // 滚入视野由 render() 末尾的活动标签可见性逻辑统一保证。
      activateDocumentTab(menuItem.dataset.activateTab);
      return;
    }

    const tab = target.closest<HTMLElement>('[role="tab"][data-tab-id]');
    if (tab?.dataset.tabId) {
      closeList();
      activateDocumentTab(tab.dataset.tabId);
    }
  };
  root.addEventListener('click', onClick);

  const onWheel = (event: WheelEvent) => {
    // Only take the gesture over when the strip can actually move sideways.
    // Swallowing wheel input while every tab fits would break page scrolling.
    const overflow = scroll.scrollWidth - scroll.clientWidth;
    if (overflow <= 0) return;
    const delta = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (delta === 0) return;
    const next = Math.max(0, Math.min(overflow, scroll.scrollLeft + delta));
    // At either end the gesture belongs to the surrounding page again.
    if (next === scroll.scrollLeft) return;
    scroll.scrollLeft = next;
    event.preventDefault();
  };
  scroll.addEventListener('wheel', onWheel, { passive: false });

  const dismissList = (event: MouseEvent) => {
    if (!list || list.hidden || !(event.target instanceof Node) || root.contains(event.target)) return;
    closeList();
  };
  document.addEventListener('click', dismissList);

  const onKeyDown = (event: KeyboardEvent) => {
    // Menu semantics: the trigger opens with Down/Enter/Space, Escape closes and
    // hands focus back, and Up/Down/Home/End move between the radio items.
    const target = event.target;
    const inMenu = target instanceof Node && Boolean(list?.contains(target));
    if (event.key === 'Escape' && (inMenu || (list && !list.hidden && target === listButton))) {
      event.preventDefault();
      closeList(true);
      return;
    }
    if (target === listButton && ['ArrowDown', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      openList();
      return;
    }
    if (inMenu && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      const items = menuItems();
      const index = items.indexOf(target as HTMLButtonElement);
      if (index < 0 || items.length === 0) return;
      let nextIndex = index;
      if (event.key === 'ArrowDown') nextIndex = (index + 1) % items.length;
      if (event.key === 'ArrowUp') nextIndex = (index - 1 + items.length) % items.length;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = items.length - 1;
      event.preventDefault();
      items[nextIndex].focus();
      return;
    }
    if (event.key === 'Tab' && inMenu) closeList();
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
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
  };
  root.addEventListener('keydown', onKeyDown);

  const onAuxClick = (event: MouseEvent) => {
    if (event.button !== 1) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const tabItem = target.closest<HTMLElement>('[data-tab-item]');
    if (!tabItem?.dataset.tabItem) return;
    event.preventDefault();
    closeDocumentTab(tabItem.dataset.tabItem);
  };
  root.addEventListener('auxclick', onAuxClick);

  render();
  // Every listener this module adds is removed here, so re-initialising the
  // tab bar never leaves a stale handler attached to the shared nodes.
  return () => {
    unsubscribe();
    document.removeEventListener('click', dismissList);
    newButton.removeEventListener('click', onNewTab);
    root.removeEventListener('mousedown', onMouseDown);
    root.removeEventListener('click', onClick);
    root.removeEventListener('keydown', onKeyDown);
    root.removeEventListener('auxclick', onAuxClick);
    scroll.removeEventListener('wheel', onWheel);
  };
}
