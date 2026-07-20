/**
 * 统一 ContextMenu API — showContextMenuStatic
 *
 * 使用已存在的 #context-menu 骨架，统一定位和关闭行为。
 * 自动处理：菜单位置限界（clampMenuPosition）、外部点击关闭。
 */

import { clampMenuPosition } from '../mermaidContextMenu.helpers';

export interface ContextMenuItem {
  label?: string;
  onClick?: () => void;
  danger?: boolean;
  divider?: boolean;
  disabled?: boolean;
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

  menu.innerHTML = items.map(item => {
    if (item.divider) {
      return '<hr style="border:none;border-top:1px solid var(--border);margin:4px 0" role="separator">';
    }
    const dangerClass = item.danger ? ' danger' : '';
    const disabledAttr = item.disabled ? ' aria-disabled="true" disabled' : '';
    return `<button class="context-menu-item${dangerClass}" role="menuitem"${disabledAttr}>${escapeHtml(item.label || '')}</button>`;
  }).join('');

  // Menu is hidden by default; position then show
  menu.hidden = true;
  menu.style.visibility = 'hidden';
  menu.style.left = '0px';
  menu.style.top = '0px';

  const rect = menu.getBoundingClientRect();
  const clamped = clampMenuPosition({
    x: position.x,
    y: position.y,
    menuWidth: rect.width || 160,
    menuHeight: rect.height || 200,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  });

  menu.style.left = `${clamped.left}px`;
  menu.style.top = `${clamped.top}px`;
  menu.style.visibility = '';
  menu.hidden = false;

  // Focus the first menu item for keyboard accessibility
  const firstItem = menu.querySelector('.context-menu-item') as HTMLElement | null;
  firstItem?.focus();

  // Click handler for items
  const itemClickHandler = (e: Event) => {
    const target = e.target as HTMLElement;
    const button = target.closest('.context-menu-item') as HTMLElement | null;
    if (!button) return;
    if (button.getAttribute('aria-disabled') === 'true') return;
    const index = Array.from(menu!.querySelectorAll('.context-menu-item')).indexOf(button);
    if (index >= 0 && index < items.length) {
      const item = items[index];
      hide();
      item.onClick?.();
    }
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

  // Escape → close
  const keyHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') hide();
  };
  document.addEventListener('keydown', keyHandler);

  const hide = () => {
    if (menu) {
      menu.hidden = true;
      menu.style.visibility = '';
    }
    menu?.removeEventListener('click', itemClickHandler);
    document.removeEventListener('mousedown', externalClickHandler);
    document.removeEventListener('scroll', scrollHandler, true);
    document.removeEventListener('keydown', keyHandler);
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
