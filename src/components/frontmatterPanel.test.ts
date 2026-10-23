import { beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzeFrontmatter } from '../lib/frontmatter';

const mocks = vi.hoisted(() => ({
  markdown: '', version: 1,
  state: { mode: 'wysiwyg', activeFilePath: '/a.md' as string | null, readOnly: false },
  listeners: new Map<string, Array<() => void>>(),
  apply: vi.fn(), menu: vi.fn(),
}));
vi.mock('../lib/editor', () => ({ getMarkdown: () => mocks.markdown, applyFrontmatterMarkdown: (next: string) => { mocks.apply(next); mocks.markdown = next; mocks.listeners.get('editor:update')?.forEach(callback => callback()); } }));
vi.mock('../lib/editor.state', () => ({ getEditorDocumentVersion: () => mocks.version }));
vi.mock('../lib/store', () => ({ store: { getState: () => mocks.state, on: (name: string, callback: () => void) => { const callbacks = mocks.listeners.get(name) ?? []; callbacks.push(callback); mocks.listeners.set(name, callbacks); } } }));
vi.mock('./ui/contextMenu', () => ({ showContextMenuStatic: mocks.menu }));
import { mountFrontmatterPanel, refreshFrontmatterPanel, openNewFrontmatterField } from './frontmatterPanel';

type MenuItem = { label?: string; disabled?: boolean; onClick?: () => void; submenu?: MenuItem[] };
function input(attribute: string, key: string): HTMLInputElement {
  const result = [...document.querySelectorAll<HTMLInputElement>(`[${attribute}]`)].find(element => element.getAttribute(attribute) === key);
  if (!result) throw new Error(`Missing ${attribute}: ${key}`);
  return result;
}
function change(element: HTMLInputElement | HTMLTextAreaElement, value: string) { element.value = value; element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })); }
function fields() { const result = analyzeFrontmatter(mocks.markdown); if (!result.supported) throw new Error(result.reason); return result.fields; }
function value(key: string) { return fields().find(field => field.key === key)?.value; }
function menuItem(label: string): MenuItem {
  const menu = mocks.menu.mock.calls[mocks.menu.mock.calls.length - 1]?.[0] as MenuItem[];
  const find = (items: MenuItem[]): MenuItem | undefined => {
    for (const item of items) {
      if (item.label === label) return item;
      const nested = item.submenu && find(item.submenu);
      if (nested) return nested;
    }
    return undefined;
  };
  const item = find(menu);
  if (!item) throw new Error(`Missing menu: ${label}`);
  return item;
}
function openMenu(key: string) { input('data-fm-menu', key).click(); }
function key(element: HTMLElement, value: string, altKey = false) { element.dispatchEvent(new KeyboardEvent('keydown', { key: value, altKey, bubbles: true, cancelable: true })); }
function setup(source = '---\ntitle: Hello\ntags: [one, "two,three"]\ncount: 2\n---\n\nBody\n') {
  mocks.markdown = source; mountFrontmatterPanel(document.body);
}
beforeEach(() => {
  document.body.innerHTML = ''; mocks.markdown = ''; mocks.version += 1;
  mocks.state = { mode: 'wysiwyg', activeFilePath: '/a.md', readOnly: false };
  mocks.listeners.clear(); mocks.apply.mockClear(); mocks.menu.mockClear();
});

describe('compact frontmatter panel', () => {
  it('renders compact rows without permanent operation controls or add form', () => {
    setup(); expect(document.querySelector('header')?.textContent).toContain('笔记属性');
    expect(document.querySelectorAll('.frontmatter-type svg')).toHaveLength(3);
    expect(document.querySelector('select')).toBeNull(); expect(document.querySelector('[data-fm-add]')).toBeNull();
    expect(document.querySelector('.frontmatter-field')?.getAttribute('draggable')).toBeNull();
    expect(input('data-fm-kind', 'title').title).toContain('按住拖动');
  });
  it('commits name/value on Enter without per-keystroke writes or DOM replacement', () => {
    setup(); const name = input('data-fm-key-value', 'title'); name.focus(); name.value = 'name';
    name.dispatchEvent(new Event('input', { bubbles: true })); expect(mocks.apply).not.toHaveBeenCalled();
    key(name, 'Enter'); expect(value('name')).toBe('Hello'); expect(document.activeElement).toBe(name);
    const field = input('data-fm-value', 'name'); change(field, 'Updated'); expect(value('name')).toBe('Updated');
    expect(input('data-fm-value', 'name')).toBe(field); expect(mocks.markdown.endsWith('Body\n')).toBe(true);
  });
  it('preserves pending edits and caret across body and frontmatter refreshes', () => {
    setup(); const field = input('data-fm-value', 'title'); field.focus(); field.value = 'draft'; field.setSelectionRange(2, 2);
    mocks.markdown += 'More body\n'; refreshFrontmatterPanel(); expect(input('data-fm-value', 'title')).toBe(field);
    mocks.markdown = mocks.markdown.replace('count: 2', 'count: 3'); refreshFrontmatterPanel();
    const restored = input('data-fm-value', 'title'); expect(restored.value).toBe('draft'); expect(document.activeElement).toBe(restored); expect(restored.selectionStart).toBe(2);
    key(restored, 'Enter'); expect(value('title')).toBe('draft'); expect(value('count')).toBe(3);
  });
  it('rejects duplicate names visibly and Escape cancels the draft', () => {
    setup(); const name = input('data-fm-key-value', 'title'); change(name, 'count');
    expect(value('title')).toBe('Hello'); expect(name.validationMessage).toBeTruthy(); expect(document.querySelector('output')?.textContent).toBeTruthy();
    key(name, 'Escape'); expect(name.value).toBe('title'); expect(name.validationMessage).toBe('');
  });
  it('does not eat a subsequent menu click after a blur commit', () => {
    setup(); const field = input('data-fm-value', 'title'); const button = input('data-fm-menu', 'title');
    field.value = 'Changed'; field.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: button }));
    expect(button.isConnected).toBe(true); button.click(); expect(menuItem('删除属性')).toBeTruthy(); expect(value('title')).toBe('Changed');
  });
  it('commits active field/tag drafts at save boundaries without submitting new-property forms', () => {
    setup(); const title = input('data-fm-value', 'title'); title.focus(); title.value = 'Save without blur';
    document.getElementById('frontmatter-region')!.dispatchEvent(new Event('markflow:commit-draft'));
    expect(value('title')).toBe('Save without blur'); expect(document.activeElement).toBe(title);
    const name = input('data-fm-key-value', 'title'); name.value = 'renamed';
    const tag = input('data-fm-tag-value', 'tags'); tag.value = 'changed';
    const next = input('data-fm-tag-new', 'tags'); next.value = 'save-tag';
    document.getElementById('frontmatter-region')!.dispatchEvent(new Event('markflow:commit-draft'));
    expect(value('renamed')).toBe('Save without blur'); expect(value('tags')).toEqual(['changed', 'two,three', 'save-tag']);
    document.querySelector<HTMLButtonElement>('[data-fm-open-add]')!.click();
    document.querySelector<HTMLInputElement>('[name="key"]')!.value = 'not-submitted';
    document.querySelector<HTMLInputElement>('[name="value"]')!.value = 'draft';
    document.getElementById('frontmatter-region')!.dispatchEvent(new Event('markflow:commit-draft'));
    expect(value('not-submitted')).toBeUndefined();
  });
  it('guards save-boundary drafts against read-only changes and document switches', () => {
    setup(); const title = input('data-fm-value', 'title'); title.value = 'Old draft';
    const region = document.getElementById('frontmatter-region')!;
    mocks.state.readOnly = true; region.dispatchEvent(new Event('markflow:commit-draft')); expect(value('title')).toBe('Hello');
    mocks.state.readOnly = false; mocks.version += 1; mocks.markdown = mocks.markdown.replace('Hello', 'New document');
    region.dispatchEvent(new Event('markflow:commit-draft')); expect(value('title')).toBe('New document');
    refreshFrontmatterPanel(); expect(input('data-fm-value', 'title').value).toBe('New document');
  });
  it('commits raw YAML drafts at the same save boundary', () => {
    setup('---\nnested:\n  child: value\n---\nBody');
    const raw = document.querySelector<HTMLTextAreaElement>('textarea')!; raw.focus(); raw.value = 'nested:\n  child: saved\n';
    document.getElementById('frontmatter-region')!.dispatchEvent(new Event('markflow:commit-draft'));
    expect(mocks.markdown).toContain('child: saved'); expect(document.activeElement).toBe(raw);
  });
  it('keeps natural Tab focus transfer and exposes inline name/value editing', () => {
    setup(); const title = input('data-fm-value', 'title'); title.focus(); title.value = 'Draft';
    const menu = input('data-fm-menu', 'title'); title.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: menu })); menu.focus();
    expect(document.activeElement).toBe(menu); expect(input('data-fm-key-value', 'title')).toBeTruthy(); expect(title).toBeTruthy();
  });
  it('edits comma-containing tags as single values, adds on Enter/blur and removes chips', () => {
    setup(); const tags = document.querySelectorAll<HTMLInputElement>('[data-fm-tag-value="tags"]');
    change(tags[1], 'still,a,tag'); expect(value('tags')).toEqual(['one', 'still,a,tag']);
    const next = input('data-fm-tag-new', 'tags'); next.value = 'new,tag'; key(next, 'Enter');
    expect(value('tags')).toEqual(['one', 'still,a,tag', 'new,tag']); expect(next.isConnected).toBe(true);
    next.value = 'blur'; next.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    expect(value('tags')).toEqual(['one', 'still,a,tag', 'new,tag', 'blur']);
    document.querySelector<HTMLButtonElement>('[data-fm-tag-remove="tags"]')!.click();
    expect(value('tags')).toEqual(['still,a,tag', 'new,tag', 'blur']);
  });
  it('uses a context menu for tag editing/removal and checks stale tag indices', () => {
    setup(); const tag = document.querySelector<HTMLInputElement>('[data-fm-tag-value="tags"]')!;
    const outside = vi.fn(); document.addEventListener('contextmenu', outside);
    tag.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(outside).not.toHaveBeenCalled(); document.removeEventListener('contextmenu', outside);
    menuItem('编辑标签').onClick?.(); expect(document.activeElement).toBe(tag);
    const remove = menuItem('移除标签').onClick;
    mocks.markdown = mocks.markdown.replace('[one, "two,three"]', '[different, "two,three"]'); remove?.();
    expect(value('tags')).toEqual(['different', 'two,three']);
  });
  it('shows add form on demand and reports invalid additions', () => {
    setup(); document.querySelector<HTMLButtonElement>('[data-fm-open-add]')!.click();
    const form = document.querySelector<HTMLFormElement>('[data-fm-add]')!;
    const name = form.elements.namedItem('key') as HTMLInputElement; const field = form.elements.namedItem('value') as HTMLInputElement;
    expect(document.activeElement).toBe(name); name.value = 'title'; field.value = 'Duplicate';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); expect(name.validationMessage).toBeTruthy();
    name.value = 'author'; field.value = 'Someone'; form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(value('author')).toBe('Someone'); expect(document.querySelector('[data-fm-add]')).toBeNull();
  });
  it('supports top-menu creation focus and canceling add form', () => {
    setup('---\n---\nBody'); openNewFrontmatterField();
    const name = document.querySelector<HTMLInputElement>('[name="key"]')!; expect(document.activeElement).toBe(name);
    key(name, 'Escape'); expect(document.querySelector('[data-fm-add]')).toBeNull();
  });
  it('offers field operations, rejects unsafe type conversions and uses scalar-preserving array conversion', () => {
    setup(); openMenu('title'); expect(menuItem('上移').disabled).toBe(true);
    expect(menuItem('属性类型').submenu).toBeTruthy(); menuItem('数字').onClick?.();
    expect(value('title')).toBe('Hello'); expect(document.querySelector('output')?.textContent).toContain('数字');
    input('data-fm-kind', 'title').click(); menuItem('复选框').onClick?.(); expect(value('title')).toBe('Hello');
    input('data-fm-kind', 'title').click(); menuItem('列表').onClick?.(); expect(value('title')).toEqual(['Hello']);
    expect(input('data-fm-key-value', 'title')).toBeTruthy();
    openMenu('title'); menuItem('删除属性').onClick?.(); expect(value('title')).toBeUndefined();
  });
  it('converts empty text to an empty list and makes null editing explicit through the type menu', () => {
    setup('---\nempty: ""\nmissing: null\n---\nBody');
    input('data-fm-kind', 'empty').click(); menuItem('列表').onClick?.(); expect(value('empty')).toEqual([]);
    const missing = input('data-fm-value', 'missing'); expect(missing.readOnly).toBe(true); expect(missing.title).toContain('属性类型');
    input('data-fm-kind', 'missing').click(); menuItem('文本').onClick?.();
    const text = input('data-fm-value', 'missing'); expect(text.readOnly).toBe(false); change(text, 'Now editable'); expect(value('missing')).toBe('Now editable');
  });
  it('validates numbers and calendar dates without writing invalid content', () => {
    setup('---\ncount: 2\npublished: 2026-10-23\n---\nBody');
    const number = input('data-fm-value', 'count'); change(number, 'NaN'); expect(value('count')).toBe(2); expect(number.validationMessage).toBeTruthy();
    const date = input('data-fm-value', 'published'); change(date, '2026-02-30'); expect(value('published')).toBe('2026-10-23');
    change(date, '2026-02-28'); expect(value('published')).toBe('2026-02-28');
  });
  it('retains typed arrays and rejects invalid typed tag edits', () => {
    setup('---\ncounts: [1, 2]\nflags: [true, false]\n---\nBody');
    change(input('data-fm-tag-value', 'counts'), '3'); expect(value('counts')).toEqual([3, 2]);
    change(input('data-fm-tag-value', 'flags'), 'not-bool'); expect(value('flags')).toEqual([true, false]);
  });
  it('keeps small/large numbers decimal when editing or extending numeric arrays', () => {
    setup('---\nsmall: 0.0000001\nlarge: 1000000000000000000000\ncounts: [0.0000001, 1000000000000000000000, 2]\n---\nBody');
    expect(input('data-fm-value', 'small').value).toBe('0.0000001');
    expect(input('data-fm-value', 'large').value).toBe('1000000000000000000000');
    const chips = document.querySelectorAll<HTMLInputElement>('[data-fm-tag-value="counts"]');
    expect([...chips].map(chip => chip.value)).toEqual(['0.0000001', '1000000000000000000000', '2']);
    change(chips[2], '3'); expect(value('counts')).toEqual([0.0000001, 1e21, 3]);
    const next = input('data-fm-tag-new', 'counts'); next.value = '4'; key(next, 'Enter');
    expect(value('counts')).toEqual([0.0000001, 1e21, 3, 4]);
    change(chips[2], '1e-7'); expect(chips[2].validationMessage).toContain('数字'); expect(value('counts')).toEqual([0.0000001, 1e21, 3, 4]);
    key(chips[2], 'Escape');
    chips[0].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    menuItem('移除标签').onClick?.(); expect(value('counts')).toEqual([1e21, 3, 4]);
  });
  it('moves fields by keyboard and menu with boundary protection', () => {
    setup(); key(input('data-fm-kind', 'title'), 'ArrowDown', true); expect(fields().map(field => field.key)).toEqual(['tags', 'title', 'count']);
    expect(document.activeElement).toBe(input('data-fm-kind', 'title'));
    openMenu('count'); expect(menuItem('下移').disabled).toBe(true); menuItem('上移').onClick?.(); expect(fields().map(field => field.key)).toEqual(['tags', 'count', 'title']);
  });
  it('drags only from a handle, highlights target and clears canceled drag state', () => {
    setup(); const handle = input('data-fm-kind', 'title'); const target = document.querySelector<HTMLElement>('[data-key="count"]')!;
    const originalElementFromPoint = document.elementFromPoint;
    let hitTarget = target;
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: vi.fn(() => hitTarget) });
    Object.defineProperty(target, 'getBoundingClientRect', { configurable: true, value: () => ({ top: 0, height: 20 }) });
    const pointer = (type: string, pointerId: number, clientX: number, clientY: number) => {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX, clientY });
      Object.defineProperty(event, 'pointerId', { value: pointerId });
      return event;
    };
    Object.defineProperty(handle, 'setPointerCapture', { configurable: true, value: vi.fn() });
    handle.dispatchEvent(pointer('pointerdown', 1, 0, 0));
    handle.dispatchEvent(pointer('pointermove', 1, 10, 20)); expect(handle.closest('.is-dragging')).toBeTruthy();
    expect(target.classList.contains('is-drop-target')).toBe(true); expect(target.classList.contains('is-drop-after')).toBe(true);
    handle.dispatchEvent(pointer('pointerup', 1, 10, 20)); expect(fields().map(field => field.key)).toEqual(['tags', 'count', 'title']);
    const next = input('data-fm-kind', 'title'); const upward = document.querySelector<HTMLElement>('[data-key="count"]')!;
    hitTarget = upward;
    Object.defineProperty(next, 'setPointerCapture', { configurable: true, value: vi.fn() });
    Object.defineProperty(upward, 'getBoundingClientRect', { configurable: true, value: () => ({ top: 0, height: 20 }) });
    next.dispatchEvent(pointer('pointerdown', 2, 0, 0)); next.dispatchEvent(pointer('pointermove', 2, 10, 0));
    expect(upward.classList.contains('is-drop-target')).toBe(true); expect(upward.classList.contains('is-drop-after')).toBe(false);
    next.dispatchEvent(pointer('pointercancel', 2, 10, 0));
    expect(document.querySelector('.is-dragging')).toBeNull(); expect(document.querySelector('.is-drop-after')).toBeNull();
    expect(fields().map(field => field.key)).toEqual(['tags', 'count', 'title']);
    if (originalElementFromPoint) Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: originalElementFromPoint });
    else delete (document as Partial<Document>).elementFromPoint;
  });
  it('keeps collapse across commits/refresh and allows collapsing read-only metadata', () => {
    setup(); document.querySelector<HTMLButtonElement>('[data-fm-collapse]')!.click();
    mocks.markdown = mocks.markdown.replace('count: 2', 'count: 3'); refreshFrontmatterPanel();
    expect(document.querySelector('[data-fm-collapse]')?.getAttribute('aria-expanded')).toBe('false');
    mocks.state.readOnly = true; refreshFrontmatterPanel(); expect(input('data-fm-value', 'title').disabled).toBe(true);
    document.querySelector<HTMLButtonElement>('[data-fm-collapse]')!.click(); expect(document.querySelector('[data-fm-collapse]')?.getAttribute('aria-expanded')).toBe('true');
  });
  it('blocks stale menus and inputs after read-only transition or document switch including untitled tabs', () => {
    setup(); openMenu('title'); const remove = menuItem('删除属性').onClick;
    mocks.state.readOnly = true; remove?.(); expect(value('title')).toBe('Hello');
    mocks.state.readOnly = false; openMenu('title'); const stale = menuItem('删除属性').onClick; const field = input('data-fm-value', 'title');
    mocks.version += 1; mocks.markdown = mocks.markdown.replace('Hello', 'New document'); stale?.(); change(field, 'Old draft');
    expect(value('title')).toBe('New document'); refreshFrontmatterPanel(); expect(input('data-fm-value', 'title').value).toBe('New document');
  });
  it('escapes special attribute characters in keys, values and tags', () => {
    setup('---\n\'a" onfocus="attack\': \'<img src=x onerror=attack>\'\ntags: [\'a" onfocus="attack\']\n---\nBody');
    expect(document.querySelector('[onfocus]')).toBeNull(); expect(document.querySelector('img')).toBeNull();
    const field = input('data-fm-value', 'a" onfocus="attack'); expect(field.value).toBe('<img src=x onerror=attack>');
    change(field, 'Safe'); expect(value('a" onfocus="attack')).toBe('Safe');
  });
  it('keeps raw YAML fallback editable and hides the whole region in source mode', () => {
    setup('---\nnested:\n  child: value\n---\nBody');
    const raw = document.querySelector<HTMLTextAreaElement>('textarea')!; expect(raw).toBeTruthy(); change(raw, 'nested:\n  child: updated\n'); expect(mocks.markdown).toContain('child: updated');
    change(raw, 'title: safe\n'); raw.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); expect(value('title')).toBe('safe'); expect(document.querySelector('textarea')).toBeNull();
    mocks.state.mode = 'source'; refreshFrontmatterPanel(); expect(document.getElementById('frontmatter-region')?.hidden).toBe(true);
    mocks.state.mode = 'wysiwyg'; mocks.markdown = 'Body'; refreshFrontmatterPanel(); expect(document.getElementById('frontmatter-region')?.hidden).toBe(true);
  });
});
