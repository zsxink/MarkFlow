/**
 * 统一 ContextMenu API — showContextMenuStatic
 *
 * 使用已存在的 #context-menu 骨架，统一定位和关闭行为。
 * 自动处理：菜单位置限界（clampMenuPosition）、外部点击关闭。
 */

import { clampMenuPosition } from './menu-position';

export interface ContextMenuItem {
  label?: string;
  icon?: string;
  onClick?: () => void;
  danger?: boolean;
  divider?: boolean;
  disabled?: boolean;
  shortcut?: string;
  submenu?: ContextMenuItem[];
}

export interface ContextMenuOptions {
  containerId?: string;
  className?: string;
}

let currentHide: (() => void) | null = null;

export function showContextMenuStatic(
  items: ContextMenuItem[],
  position: { x: number; y: number },
  options?: ContextMenuOptions
) {
  // Close previous menu if still open
  if (currentHide) {
    currentHide();
    currentHide = null;
  }

  // Track the element that triggered the menu for focus restoration
  const previousFocus = document.activeElement as HTMLElement | null;

  const containerId = options?.containerId || 'context-menu';
  let menu = document.getElementById(containerId) as HTMLElement | null;

  if (!menu) {
    menu = document.createElement('div');
    menu.id = containerId;
    menu.className = 'context-menu';
    menu.setAttribute('role', 'menu');
    document.body.appendChild(menu);
  }

  if (options?.className) {
    menu.className = `context-menu ${options.className}`;
  } else {
    menu.className = 'context-menu';
  }

  const renderItems = (list: ContextMenuItem[], prefix = ''): string => list.map((item, index) => {
    const path = prefix ? `${prefix}.${index}` : String(index);
    if (item.divider) return '<hr class="context-menu-divider" role="separator">';
    const dangerClass = item.danger ? ' danger' : '';
    const submenuClass = item.submenu?.length ? ' has-submenu' : '';
    const disabledAttr = item.disabled ? ' aria-disabled="true" disabled' : '';
    const submenuAttr = item.submenu?.length ? ' aria-haspopup="menu" aria-expanded="false"' : '';
    const icon = item.icon ? `<span class="context-menu-icon" aria-hidden="true">${item.icon}</span>` : '';
    const shortcut = item.shortcut ? `<span class="context-menu-shortcut">${escapeHtml(item.shortcut)}</span>` : '';
    const arrow = item.submenu?.length ? '<span class="context-menu-chevron" aria-hidden="true">›</span>' : '';
    const button = `<button class="context-menu-item${dangerClass}${submenuClass}" role="menuitem" data-menu-path="${path}"${disabledAttr}${submenuAttr}>${icon}<span class="context-menu-label">${escapeHtml(item.label || '')}</span>${shortcut}${arrow}</button>`;
    if (!item.submenu?.length) return button;
    return `<div class="context-menu-entry">${button}<div class="context-menu-submenu-panel" role="menu" hidden>${renderItems(item.submenu, path)}</div></div>`;
  }).join('');
  menu.innerHTML = renderItems(items);

  // Menu is hidden by default; position then show
  menu.hidden = false;
  menu.style.visibility = 'hidden';
  menu.style.left = '0px';
  menu.style.top = '0px';

  const rect = menu.getBoundingClientRect();
  const clamped = clampMenuPosition({
    x: position.x,
    y: position.y,
    menuWidth: rect.width || 220,
    menuHeight: rect.height || 200,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  });

  menu.style.left = `${clamped.left}px`;
  menu.style.top = `${clamped.top}px`;
  menu.style.visibility = '';
  menu.hidden = false;

  // Focus the first enabled menu item for keyboard accessibility.
  const firstItem = menu.querySelector('.context-menu-item:not(:disabled)') as HTMLElement | null;
  firstItem?.focus();

  const getItem = (button: HTMLElement): ContextMenuItem | undefined => {
    const path = button.dataset.menuPath?.split('.').map(Number);
    if (!path?.length || path.some(index => !Number.isInteger(index))) return undefined;
    let list = items;
    let item: ContextMenuItem | undefined;
    for (const index of path) {
      item = list[index];
      if (!item) return undefined;
      list = item.submenu || [];
    }
    return item;
  };

  const openSubmenu = (button: HTMLElement) => {
    const entry = button.closest('.context-menu-entry') as HTMLElement | null;
    const panel = entry?.querySelector(':scope > .context-menu-submenu-panel') as HTMLElement | null;
    if (!panel || (button as HTMLButtonElement).disabled) return;
    const siblings = entry?.parentElement?.querySelectorAll(':scope > .context-menu-entry > .context-menu-submenu-panel') || [];
    siblings.forEach(node => {
      if (node === panel) return;
      node.setAttribute('hidden', '');
      (node.parentElement?.querySelector(':scope > .context-menu-item') as HTMLElement | null)?.setAttribute('aria-expanded', 'false');
    });
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    panel.style.left = '0px';
    panel.style.top = '0px';
    const buttonRect = button.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    let left = buttonRect.right + 6;
    if (left + panelRect.width > window.innerWidth - 8) left = buttonRect.left - panelRect.width - 6;
    const top = Math.max(8, Math.min(buttonRect.top - 6, window.innerHeight - panelRect.height - 8));
    panel.style.left = `${Math.max(8, left)}px`;
    panel.style.top = `${top}px`;
  };

  // Click handler for items
  const itemClickHandler = (e: Event) => {
    const target = e.target as HTMLElement;
    const button = target.closest('.context-menu-item') as HTMLElement | null;
    if (!button) return;
    if (button.getAttribute('aria-disabled') === 'true') return;
    const item = getItem(button);
    if (!item) return;
    if (item.submenu?.length) {
      openSubmenu(button);
      const first = button.closest('.context-menu-entry')?.querySelector('.context-menu-submenu-panel .context-menu-item:not(:disabled)') as HTMLElement | null;
      first?.focus();
      return;
    }
    hide();
    item.onClick?.();
  };

  const pointerHandler = (event: Event) => {
    const button = (event.target as HTMLElement).closest('.context-menu-item') as HTMLElement | null;
    if (!button) return;
    if (getItem(button)?.submenu?.length) {
      openSubmenu(button);
      return;
    }
    menu?.querySelectorAll('.context-menu-submenu-panel:not([hidden])').forEach(panel => {
      if (panel.contains(button)) return;
      panel.setAttribute('hidden', '');
      (panel.parentElement?.querySelector(':scope > .context-menu-item') as HTMLElement | null)?.setAttribute('aria-expanded', 'false');
    });
  };

  const keyHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { hide(); return; }
    const current = (document.activeElement as HTMLElement | null)?.closest('.context-menu-item') as HTMLElement | null;
    if (!current || !menu?.contains(current)) return;
    const submenu = getItem(current)?.submenu;
    if (e.key === 'ArrowRight' && submenu?.length) {
      e.preventDefault();
      openSubmenu(current);
      const first = current.closest('.context-menu-entry')?.querySelector('.context-menu-submenu-panel .context-menu-item:not(:disabled)') as HTMLElement | null;
      first?.focus();
      return;
    }
    if (e.key === 'ArrowLeft') {
      const panel = current.closest('.context-menu-submenu-panel') as HTMLElement | null;
      if (!panel) return;
      e.preventDefault();
      const parentEntry = panel.parentElement;
      panel.hidden = true;
      const parent = parentEntry?.querySelector(':scope > .context-menu-item') as HTMLElement | null;
      parent?.setAttribute('aria-expanded', 'false');
      parent?.focus();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const scope = current.closest('.context-menu-submenu-panel, .context-menu') as HTMLElement | null;
    if (!scope) return;
    const enabled = Array.from(scope.querySelectorAll(':scope > .context-menu-item:not(:disabled), :scope > .context-menu-entry > .context-menu-item:not(:disabled)')) as HTMLElement[];
    if (!enabled.length) return;
    e.preventDefault();
    const index = enabled.indexOf(current);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? enabled.length - 1 : (index + (e.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length;
    enabled[next]?.focus();
  };

  menu.addEventListener('click', itemClickHandler);

  // External click → close
  const externalClickHandler = (e: MouseEvent) => {
    if (menu && !menu.contains(e.target as Node)) {
      hide();
    }
  };

  document.addEventListener('mousedown', externalClickHandler);

  // Scroll → close
  const scrollHandler = () => hide();
  document.addEventListener('scroll', scrollHandler, true);

  menu.addEventListener('pointerover', pointerHandler);
  menu.addEventListener('keydown', keyHandler);

  const hide = () => {
    if (menu) {
      menu.hidden = true;
      menu.style.visibility = '';
    }
    menu?.removeEventListener('click', itemClickHandler);
    menu?.removeEventListener('pointerover', pointerHandler);
    menu?.removeEventListener('keydown', keyHandler);
    document.removeEventListener('mousedown', externalClickHandler);
    document.removeEventListener('scroll', scrollHandler, true);
    currentHide = null;

    // Restore focus to the element that triggered the menu
    if (previousFocus && typeof previousFocus.focus === 'function') {
      previousFocus.focus();
    }
  };

  currentHide = hide;
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
