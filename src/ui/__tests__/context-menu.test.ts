import { afterEach, describe, expect, it, vi } from 'vitest';
import { showContextMenuStatic } from '../context-menu';

afterEach(() => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  document.body.replaceChildren();
});

describe('shared context menu', () => {
  it('dispatches the correct action after multiple separators', () => {
    const edit = vi.fn(); const remove = vi.fn(); const disabled = vi.fn();
    showContextMenuStatic([
      { label: '编辑', onClick: edit }, { divider: true },
      { label: '上移', disabled: true, onClick: disabled }, { divider: true },
      { label: '移除', onClick: remove },
    ], { x: 10, y: 10 });
    const buttons = document.querySelectorAll<HTMLButtonElement>('.context-menu-item');
    buttons[1].click();
    expect(disabled).not.toHaveBeenCalled();
    expect(document.getElementById('context-menu')!.hidden).toBe(false);
    buttons[2].click();
    expect(remove).toHaveBeenCalledOnce();
    expect(edit).not.toHaveBeenCalled();
    expect(document.getElementById('context-menu')!.hidden).toBe(true);
  });

  it('navigates enabled actions and restores focus on escape', () => {
    const trigger = document.createElement('button'); document.body.append(trigger); trigger.focus();
    showContextMenuStatic([
      { label: '禁用', disabled: true }, { label: '第一项' }, { divider: true }, { label: '最后一项' },
    ], { x: 0, y: 0 });
    const buttons = document.querySelectorAll<HTMLButtonElement>('.context-menu-item');
    expect(document.activeElement).toBe(buttons[1]);
    buttons[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(buttons[2]);
    buttons[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(buttons[1]);
    buttons[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(trigger);
  });

  it('skips disabled actions during Home, End, and arrow navigation', () => {
    showContextMenuStatic([
      { label: '第一项' }, { label: '禁用', disabled: true }, { divider: true }, { label: '最后一项' },
    ], { x: 0, y: 0 });
    const buttons = document.querySelectorAll<HTMLButtonElement>('.context-menu-item');
    buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(buttons[2]);
    buttons[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(buttons[0]);
    buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(buttons[2]);
  });
});
