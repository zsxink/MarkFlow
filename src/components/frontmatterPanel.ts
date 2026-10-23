import { analyzeFrontmatter, patchFrontmatterField, renameFrontmatterField, addFrontmatterField, removeFrontmatterField, reorderFrontmatterField, serializeValue, type FrontmatterField, type FrontmatterKind, type FrontmatterValue } from '../lib/frontmatter';
import { getMarkdown, applyFrontmatterMarkdown } from '../lib/editor';
import { getEditorDocumentVersion } from '../lib/editor.state';
import { store } from '../lib/store';
import { showContextMenuStatic, type ContextMenuItem } from './ui/contextMenu';

let root: HTMLElement | null = null;
let identity = '';
let signature = '';
let collapsed = false;
let adding = false;
let addingKind: FrontmatterKind = 'text';
let addingArrayValues: string[] = [];
let applying = false;
let pointerDrag: { key: string; document: string; pointerId: number; startX: number; startY: number; active: boolean; targetIndex: number | null } | null = null;
let suppressDragClick: { key: string; until: number } | null = null;
const kinds: FrontmatterKind[] = ['text', 'array', 'number', 'boolean', 'date', 'null'];
const labels: Record<FrontmatterKind, string> = { text: '文本', array: '列表', number: '数字', boolean: '复选框', date: '日期', null: '空值' };
const paths: Record<FrontmatterKind, string> = {
  text: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  array: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
  number: '<path d="m10 3-4 18M18 3l-4 18M4 9h17M3 15h17"/>',
  boolean: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12 3 3 5-6"/>',
  date: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  null: '<circle cx="12" cy="12" r="8"/><path d="m6 18 12-12"/>',
};
const plusIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
const moreIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>';
const closeIcon = '<svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="m3 3 6 6m0-6-6 6"/></svg>';
function tagWidth(value: string): number { return Math.max(2, [...value].reduce((width, char) => width + (char.charCodeAt(0) > 127 ? 2 : 1), 1)); }
function icon(kind: FrontmatterKind): string { return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[kind]}</svg>`; }
function escape(value: string): string { return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!); }
function documentIdentity(): string { return `${getEditorDocumentVersion()}:${store.getState().activeFilePath ?? ''}`; }
function editable(): boolean { return !store.getState().readOnly && store.getState().mode !== 'source'; }
function current(key?: string, expected = identity) {
  if (!editable() || expected !== documentIdentity() || expected !== identity) return null;
  const source = getMarkdown();
  const analysis = analyzeFrontmatter(source);
  if (!analysis.supported || (key !== undefined && !analysis.fields.some(field => field.key === key))) return null;
  return { source, analysis };
}
function inputFor(attribute: string, key: string): HTMLInputElement | undefined { return [...(root?.querySelectorAll<HTMLInputElement>(`[${attribute}]`) ?? [])].find(input => input.getAttribute(attribute) === key); }
function report(message: string, input?: HTMLInputElement | HTMLTextAreaElement): void {
  input?.setCustomValidity(message);
  const live = root?.querySelector<HTMLOutputElement>('.frontmatter-live');
  if (live) live.value = message;
}
function parseValue(raw: string, kind: FrontmatterKind): FrontmatterValue {
  if (kind === 'null') return null;
  if (kind === 'array') return raw ? raw.split(',').map(value => value.trim()).filter(Boolean) : [];
  if (kind === 'number') {
    if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(raw) || !Number.isFinite(Number(raw))) throw new Error('请输入有效的十进制数字');
    return Number(raw);
  }
  if (kind === 'boolean') {
    if (raw !== 'true' && raw !== 'false') throw new Error('复选框值需为 true 或 false');
    return raw === 'true';
  }
  if (kind === 'date') {
    const date = new Date(`${raw}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== raw) throw new Error('请输入有效日期（YYYY-MM-DD）');
  }
  return raw;
}
// Use the same decimal spelling as YAML output. String(number) switches to
// exponent notation for small/large values, which is outside our input subset.
function displayScalar(value: unknown): string { return typeof value === 'number' ? serializeValue(value, 'number') : String(value ?? ''); }
function typedArray(field: FrontmatterField, values: string[]): FrontmatterValue {
  return values.map(value => parseValue(value, field.arrayElementKind ?? 'text')) as FrontmatterValue;
}
function addValueInput(kind: FrontmatterKind, disabled: string): string {
  if (kind === 'array') {
    const tags = addingArrayValues.map((value, index) => `<span class="frontmatter-tag"><span class="frontmatter-tag-label">${escape(value)}</span><button type="button" data-fm-add-tag-remove="${index}" aria-label="移除标签 ${escape(value)}"${disabled}>${closeIcon}</button></span>`).join('');
    return `<div class="frontmatter-tag-editor frontmatter-value frontmatter-add-tags" aria-label="新字段标签列表">${tags}<input class="frontmatter-tag-new" name="value" data-fm-add-tag placeholder="添加标签…" aria-label="添加标签"${disabled}></div>`;
  }
  const type = kind === 'boolean' ? 'checkbox' : kind === 'date' ? 'date' : kind === 'number' ? 'number' : 'text';
  const placeholder = kind === 'null' ? ' placeholder="空值" readonly' : '';
  const step = kind === 'number' ? ' step="any"' : '';
  return `<input class="frontmatter-value" name="value" aria-label="新字段值" type="${type}"${step}${placeholder}${disabled}>`;
}
function tagEditor(field: FrontmatterField, disabled: string): string {
  const key = escape(field.key);
  return `<div class="frontmatter-tag-editor frontmatter-value" aria-label="${key} 标签列表">${(field.value as unknown[]).map((tag, index) => `<span class="frontmatter-tag"><input data-fm-tag-value="${key}" data-fm-tag-index="${index}" value="${escape(displayScalar(tag))}" aria-label="${key} 标签 ${index + 1}" style="width:${tagWidth(displayScalar(tag))}ch"${disabled}><button type="button" data-fm-tag-remove="${key}" data-fm-tag-index="${index}" aria-label="移除标签 ${escape(displayScalar(tag))}"${disabled}>${closeIcon}</button></span>`).join('')}<input class="frontmatter-tag-new" data-fm-tag-new="${key}" placeholder="添加标签…" aria-label="添加 ${key} 标签"${disabled}></div>`;
}

// Preserve unfinished edits and the caret when external content changes. Own
// scalar commits update their existing DOM nodes, so blur never eats a click.
function draftSnapshot() {
  return [...(root?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea') ?? [])].map(input => ({
    id: controlId(input), value: input.value, checked: input instanceof HTMLInputElement && input.type === 'checkbox' ? input.checked : undefined,
    type: input instanceof HTMLInputElement ? input.type : input.tagName,
    dirty: input instanceof HTMLInputElement && input.type === 'checkbox' ? input.checked !== input.defaultChecked : input.value !== input.defaultValue,
    focused: input === document.activeElement, start: input.selectionStart, end: input.selectionEnd,
  }));
}
function controlId(input: HTMLInputElement | HTMLTextAreaElement): string {
  return JSON.stringify([input.dataset.fmKeyValue, input.dataset.fmValue, input.dataset.fmTagValue, input.dataset.fmTagIndex, input.dataset.fmTagNew, input.name, input.tagName]);
}
function update(markdown = getMarkdown(), force = false): void {
  if (!root || applying) return;
  const nextIdentity = documentIdentity();
  const sameDocument = nextIdentity === identity;
  if (!sameDocument) { identity = nextIdentity; collapsed = false; adding = false; addingKind = 'text'; addingArrayValues = []; clearDrag(); }
  if (store.getState().mode === 'source') { root.hidden = true; return; }
  const analysis = analyzeFrontmatter(markdown);
  const nextSignature = JSON.stringify([identity, analysis.block?.yaml, editable(), collapsed, adding]);
  if (!force && nextSignature === signature) { root.hidden = !analysis.block; return; }
  const drafts = sameDocument ? draftSnapshot() : [];
  signature = nextSignature;
  root.hidden = !analysis.block;
  if (!analysis.block) { root.innerHTML = ''; return; }
  const disabled = editable() ? '' : ' disabled';
  const header = `<header><button type="button" class="frontmatter-collapse" data-fm-collapse aria-expanded="${!collapsed}"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" aria-hidden="true"><path d="${collapsed ? 'm4 2 4 4-4 4' : 'm2 4 4 4 4-4'}"/></svg><strong>笔记属性</strong>${analysis.supported ? `<span class="frontmatter-count">${analysis.fields.length}</span>` : ''}</button></header>`;
  let content: string;
  if (!analysis.supported) {
    content = `<div class="frontmatter-fallback-reason">可视化编辑不可用：${escape(analysis.reason)}</div><textarea aria-label="Frontmatter YAML 源码"${disabled}>${escape(analysis.block.yaml)}</textarea>`;
  } else {
    const rows = analysis.fields.map(field => {
      const key = escape(field.key);
      const value = field.kind === 'array' ? tagEditor(field, disabled) : `<input class="frontmatter-value" data-fm-value="${key}" aria-label="${key} 的值" type="${field.kind === 'boolean' ? 'checkbox' : 'text'}"${field.kind === 'boolean' ? (field.value ? ' checked' : '') : ` value="${escape(displayScalar(field.value))}"`}${field.kind === 'null' ? ' placeholder="空值" readonly title="通过属性类型菜单修改空值类型"' : ''}${disabled}>`;
      return `<div class="frontmatter-field" data-key="${key}"><button type="button" class="frontmatter-type" data-fm-kind="${key}" aria-label="${key} 的属性类型：${labels[field.kind]}；按住拖动可上下排序；Alt+方向键移动" title="${labels[field.kind]} · 按住拖动可上下排序"${disabled}>${icon(field.kind)}</button><input class="frontmatter-key-input" data-fm-key-value="${key}" value="${key}" aria-label="修改字段名 ${key}"${disabled}>${value}<button type="button" class="frontmatter-menu-button" data-fm-menu="${key}" aria-label="${key} 的更多操作"${disabled}>${moreIcon}</button></div>`;
    }).join('');
    content = `<div class="frontmatter-fields">${rows}</div>${adding ? `<form class="frontmatter-add-form" data-fm-add><button type="button" class="frontmatter-type frontmatter-add-kind" data-fm-add-kind aria-haspopup="menu" aria-label="字段类型：${labels[addingKind]}" title="${labels[addingKind]}"${disabled}>${icon(addingKind)}</button><input name="key" placeholder="属性名" aria-label="新字段名"${disabled}>${addValueInput(addingKind, disabled)}<button type="submit"${disabled}>添加</button><button type="button" data-fm-cancel-add>取消</button></form>` : ''}<button type="button" class="frontmatter-add-button" data-fm-open-add${disabled}>${plusIcon}添加笔记属性</button>`;
  }
  root.innerHTML = `<section class="frontmatter-panel${collapsed ? ' collapsed' : ''}${analysis.supported ? '' : ' frontmatter-fallback'}">${header}<div class="frontmatter-content"${collapsed ? ' hidden' : ''}>${content}</div><output class="frontmatter-live" aria-live="polite"></output></section>`;
  for (const input of root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')) {
    const draft = drafts.find(item => item.id === controlId(input));
    if (!draft) continue;
    if (draft.dirty) {
      if (input instanceof HTMLInputElement && input.type === 'checkbox') input.checked = draft.type === 'checkbox' ? Boolean(draft.checked) : draft.value === 'true';
      else input.value = draft.type === 'checkbox' ? String(Boolean(draft.checked)) : draft.value;
    }
    if (draft.focused && !input.disabled) { input.focus(); try { input.setSelectionRange(draft.start, draft.end); } catch { /* checkbox has no caret */ } }
  }
}
function apply(next: string | null, render: boolean): boolean {
  if (next === null || !editable() || identity !== documentIdentity()) return false;
  applying = true;
  try { applyFrontmatterMarkdown(next); } finally { applying = false; }
  if (render) update(next, true);
  else signature = JSON.stringify([identity, analyzeFrontmatter(next).block?.yaml, editable(), collapsed, adding]);
  report('');
  return true;
}
function attempt(action: () => boolean, input?: HTMLInputElement | HTMLTextAreaElement): boolean {
  try {
    if (action()) { input?.setCustomValidity(''); return true; }
    report('属性名无效、已存在，或该属性已被修改', input);
  } catch (error) { report(error instanceof Error ? error.message : '无法更新属性', input); }
  return false;
}
function commit(input: HTMLInputElement | HTMLTextAreaElement): boolean {
  if (!editable() || identity !== documentIdentity() || !root?.contains(input)) return false;
  if (input.tagName === 'TEXTAREA') {
    const source = getMarkdown();
    const block = analyzeFrontmatter(source).block;
    if (!block || input.value === input.defaultValue) return Boolean(block);
    const ok = attempt(() => apply(source.slice(0, block.yamlFrom) + input.value + source.slice(block.yamlTo), false), input);
    if (ok) { input.defaultValue = input.value; signature = ''; }
    return ok;
  }
  const context = current();
  if (!context) return false;
  if (input instanceof HTMLInputElement && input.type !== 'checkbox' && input.value === input.defaultValue) return true;
  const target = input as HTMLInputElement;
  const key = target.dataset.fmKeyValue ?? target.dataset.fmValue ?? target.dataset.fmTagValue ?? target.dataset.fmTagNew;
  const field = context.analysis.fields.find(item => item.key === key);
  if (!field) return false;
  const ok = attempt(() => {
    if (target.dataset.fmKeyValue !== undefined) {
      const next = renameFrontmatterField(context.source, field.key, target.value);
      if (!apply(next, false)) return false;
      const newAnalysis = analyzeFrontmatter(next!);
      const nextKey = newAnalysis.supported ? newAnalysis.fields[context.analysis.fields.indexOf(field)]?.key : undefined;
      if (!nextKey) return false;
      const row = target.closest<HTMLElement>('.frontmatter-field');
      if (row) {
        row.dataset.key = nextKey;
        for (const element of row.querySelectorAll<HTMLElement>('*')) for (const name of ['fmKeyValue', 'fmValue', 'fmTagValue', 'fmTagNew', 'fmTagRemove', 'fmMenu', 'fmKind']) if (element.dataset[name] === field.key) element.dataset[name] = nextKey;
      }
      target.value = nextKey;
    } else if (target.dataset.fmTagNew !== undefined) {
      if (!target.value.trim()) return true;
      if (field.kind !== 'array') return false;
      if (!apply(patchFrontmatterField(context.source, field.key, typedArray(field, [...(field.value as unknown[]).map(displayScalar), target.value.trim()]), 'array'), false)) return false;
      // Add only the new chip: replacing the row here would eat the click
      // that caused this input to blur.
      const updated = { ...field, value: [target.value.trim()] } as FrontmatterField;
      const template = document.createElement('template');
      template.innerHTML = tagEditor(updated, '');
      const chip = template.content.querySelector('.frontmatter-tag')!;
      chip.querySelectorAll<HTMLElement>('[data-fm-tag-index]').forEach(element => { element.dataset.fmTagIndex = String((field.value as unknown[]).length); });
      chip.querySelector('input')?.setAttribute('aria-label', `${field.key} 标签 ${(field.value as unknown[]).length + 1}`);
      target.before(chip);
      target.value = '';
      target.defaultValue = '';
    } else {
      let value: FrontmatterValue;
      if (target.dataset.fmTagValue !== undefined) {
        if (field.kind !== 'array' || !target.value.trim()) throw new Error('标签不能为空；可使用移除操作');
        const values = (field.value as unknown[]).map(displayScalar);
        values[Number(target.dataset.fmTagIndex)] = target.value.trim();
        value = typedArray(field, values);
        target.value = target.value.trim();
      } else value = field.kind === 'boolean' ? target.checked : parseValue(target.value, field.kind);
      if (!apply(patchFrontmatterField(context.source, field.key, value, field.kind), false)) return false;
    }
    target.defaultValue = target.value;
    if (target.type === 'checkbox') target.defaultChecked = target.checked;
    return true;
  }, target);
  return ok;
}
function move(key: string, delta: number, expected = identity): void {
  const context = current(key, expected); if (!context) return;
  const index = context.analysis.fields.findIndex(field => field.key === key);
  const target = index + delta;
  if (target < 0 || target >= context.analysis.fields.length) return;
  attempt(() => apply(reorderFrontmatterField(context.source, key, target), true));
  inputFor('data-fm-kind', key)?.focus();
}
function typeMenuItems(key: string, expected = identity): ContextMenuItem[] {
  return kinds.map(kind => ({ label: labels[kind], onClick: () => {
    const context = current(key, expected); if (!context) return;
    const field = context.analysis.fields.find(item => item.key === key)!;
    if (kind === field.kind) return;
    attempt(() => {
      const values = Array.isArray(field.value) ? field.value : [field.value];
      if (kind !== 'array' && kind !== 'text' && kind !== 'null' && values.length !== 1) throw new Error('请先将列表调整为一个值，再修改此类型');
      const raw = values.map(displayScalar).join(', ');
      const value = kind === 'array' ? values.filter(value => value !== null && value !== '').map(displayScalar) : parseValue(raw, kind);
      return apply(patchFrontmatterField(context.source, key, value as FrontmatterValue, kind), true);
    });
  } }));
}
function fieldMenu(key: string, position: { x: number; y: number }): void {
  const expected = identity;
  const context = current(key, expected); if (!context) return;
  const guarded = (action: () => void) => () => { if (current(key, expected)) action(); };
  const index = context.analysis.fields.findIndex(field => field.key === key);
  const items: ContextMenuItem[] = [
    { label: '属性类型', submenu: typeMenuItems(key, expected) },
    { divider: true },
    { label: '上移', disabled: index === 0, onClick: guarded(() => move(key, -1, expected)) },
    { label: '下移', disabled: index === context.analysis.fields.length - 1, onClick: guarded(() => move(key, 1, expected)) },
    { divider: true },
    { label: '删除属性', danger: true, onClick: guarded(() => attempt(() => apply(removeFrontmatterField(getMarkdown(), key), true))) },
  ];
  showContextMenuStatic(items, position, { className: 'frontmatter-context-menu' });
}
function removeTag(key: string, index: number, expected = identity): void {
  const context = current(key, expected); if (!context) return;
  const field = context.analysis.fields.find(item => item.key === key)!;
  if (field.kind !== 'array') return;
  attempt(() => apply(patchFrontmatterField(context.source, key, (field.value as Array<string | number | boolean>).filter((_, i) => i !== index) as FrontmatterValue, 'array'), true));
}
function clearDrag(): void {
  pointerDrag = null;
  root?.querySelectorAll('.is-dragging, .is-drop-target, .is-drop-after').forEach(row => row.classList.remove('is-dragging', 'is-drop-target', 'is-drop-after'));
}

export function mountFrontmatterPanel(container: HTMLElement): void {
  root = document.createElement('div'); root.id = 'frontmatter-region'; root.dataset.testid = 'frontmatter-region'; root.hidden = true;
  identity = ''; signature = ''; collapsed = false; adding = false; addingKind = 'text'; addingArrayValues = []; pointerDrag = null;
  container.prepend(root);
  root.addEventListener('markflow:commit-draft', () => {
    if (!editable() || identity !== documentIdentity()) return;
    // The document save/close boundary runs without moving focus. New property
    // forms remain explicit submissions; existing field and tag drafts commit.
    const inputs = [...(root?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea') ?? [])];
    for (const input of inputs) {
      if (input.closest('[data-fm-add]') || (input instanceof HTMLInputElement && input.readOnly)) continue;
      const dirty = input instanceof HTMLInputElement && input.type === 'checkbox' ? input.checked !== input.defaultChecked : input.value !== input.defaultValue;
      if (dirty) commit(input);
    }
  });
  root.addEventListener('change', event => {
    const target = event.target;
    if ((target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) && !target.closest('[data-fm-add]')) commit(target);
  });
  root.addEventListener('focusout', event => {
    const target = event.target;
    if ((target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) && !target.closest('[data-fm-add]')) {
      commit(target);
      if (target instanceof HTMLTextAreaElement && !root?.contains(event.relatedTarget as Node | null)) update(getMarkdown());
    }
  });
  root.addEventListener('input', event => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) target.setCustomValidity('');
    if (target instanceof HTMLInputElement && target.dataset.fmTagValue !== undefined) target.style.width = `${tagWidth(target.value)}ch`;
  });
  root.addEventListener('keydown', event => {
    const target = event.target as HTMLElement;
    const row = target.closest<HTMLElement>('.frontmatter-field');
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown') && row?.dataset.key) {
      event.preventDefault(); move(row.dataset.key, event.key === 'ArrowUp' ? -1 : 1); return;
    }
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
    if (target instanceof HTMLInputElement && target.dataset.fmAddTag !== undefined && event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();
      const value = target.value.trim();
      if (value) addingArrayValues.push(value);
      target.value = '';
      update(getMarkdown(), true);
      root?.querySelector<HTMLInputElement>('[data-fm-add-tag]')?.focus();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault(); target.value = target.defaultValue; if (target instanceof HTMLInputElement && target.type === 'checkbox') target.checked = target.defaultChecked; target.setCustomValidity(''); report('');
      if (target.closest('[data-fm-add]')) { adding = false; addingKind = 'text'; addingArrayValues = []; update(getMarkdown(), true); }
    } else if (event.key === 'Enter' && !event.isComposing && !target.closest('[data-fm-add]') && target.tagName !== 'TEXTAREA') {
      event.preventDefault(); commit(target);
    }
  });
  root.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!button) return;
    if (button.dataset.fmCollapse !== undefined) { collapsed = !collapsed; update(getMarkdown(), true); return; }
    if (!editable() || identity !== documentIdentity()) return;
    if (button.dataset.fmKind !== undefined && suppressDragClick?.key === button.dataset.fmKind && performance.now() < suppressDragClick.until) {
      suppressDragClick = null;
      event.preventDefault();
      return;
    }
    if (button.dataset.fmOpenAdd !== undefined) { adding = true; addingKind = 'text'; addingArrayValues = []; collapsed = false; update(getMarkdown(), true); root?.querySelector<HTMLInputElement>('[name="key"]')?.focus(); }
    else if (button.dataset.fmAddKind !== undefined) {
      const rect = button.getBoundingClientRect();
      showContextMenuStatic(kinds.map(kind => ({ label: labels[kind], icon: icon(kind), onClick: () => {
        const pendingTag = root?.querySelector<HTMLInputElement>('[data-fm-add-tag]')?.value.trim();
        if (addingKind === 'array' && pendingTag) addingArrayValues.push(pendingTag);
        const pendingInput = root?.querySelector<HTMLInputElement>('[data-fm-add-tag]');
        if (pendingInput) pendingInput.value = '';
        addingKind = kind;
        update(getMarkdown(), true);
        root?.querySelector<HTMLInputElement>('[data-fm-add-tag]')?.focus() ?? root?.querySelector<HTMLButtonElement>('[data-fm-add-kind]')?.focus();
      } })), { x: rect.left, y: rect.bottom }, { className: 'frontmatter-context-menu' });
    }
    else if (button.dataset.fmAddTagRemove !== undefined) {
      addingArrayValues.splice(Number(button.dataset.fmAddTagRemove), 1);
      update(getMarkdown(), true);
      root?.querySelector<HTMLInputElement>('[data-fm-add-tag]')?.focus();
    }
    else if (button.dataset.fmCancelAdd !== undefined) { adding = false; addingKind = 'text'; addingArrayValues = []; update(getMarkdown(), true); }
    else if (button.dataset.fmMenu !== undefined || button.dataset.fmKind !== undefined) {
      const rect = button.getBoundingClientRect();
      if (button.dataset.fmMenu !== undefined) fieldMenu(button.dataset.fmMenu, { x: rect.left, y: rect.bottom });
      else fieldMenu(button.dataset.fmKind!, { x: rect.left, y: rect.bottom });
    } else if (button.dataset.fmTagRemove !== undefined) removeTag(button.dataset.fmTagRemove, Number(button.dataset.fmTagIndex));
  });
  root.addEventListener('contextmenu', event => {
    const target = event.target as HTMLElement;
    if (target instanceof HTMLInputElement) commit(target);
    const row = target.closest<HTMLElement>('.frontmatter-field');
    if (!row?.dataset.key || !current(row.dataset.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const tag = target.closest<HTMLElement>('.frontmatter-tag');
    const input = tag?.querySelector<HTMLInputElement>('[data-fm-tag-value]');
    if (!input) { fieldMenu(row.dataset.key, { x: event.clientX, y: event.clientY }); return; }
    const expected = identity; const key = row.dataset.key; const index = Number(input.dataset.fmTagIndex);
    const original = input.defaultValue;
    const valid = () => {
      const context = current(key, expected);
      const field = context?.analysis.fields.find(item => item.key === key);
      return field?.kind === 'array' && displayScalar((field.value as unknown[])[index]) === original;
    };
    showContextMenuStatic([
      { label: '编辑标签', onClick: () => { if (valid()) { input.focus(); input.select(); } } },
      { label: '移除标签', danger: true, onClick: () => { if (valid()) removeTag(key, index, expected); } },
    ], { x: event.clientX, y: event.clientY }, { className: 'frontmatter-context-menu' });
  });
  root.addEventListener('submit', event => {
    event.preventDefault(); const context = current(); if (!context) return;
    const form = event.target as HTMLFormElement;
    const data = new FormData(form); const input = form.elements.namedItem('key') as HTMLInputElement;
    const valueInput = form.elements.namedItem('value') as HTMLInputElement;
    attempt(() => {
      const kind = addingKind;
      const rawValue = kind === 'boolean' ? String(valueInput.checked) : valueInput.value;
      const arrayValues = kind === 'array' ? [...addingArrayValues, valueInput.value.trim()].filter(Boolean) : [];
      const value = kind === 'array' ? arrayValues : parseValue(rawValue, kind);
      const next = addFrontmatterField(context.source, String(data.get('key') ?? '').trim(), value, kind);
      if (next === null) return false;
      adding = false;
      addingKind = 'text';
      addingArrayValues = [];
      return apply(next, true);
    }, input);
  });
  root.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !editable() || identity !== documentIdentity()) return;
    const handle = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-fm-kind]');
    if (!handle?.dataset.fmKind || !current(handle.dataset.fmKind)) return;
    pointerDrag = {
      key: handle.dataset.fmKind, document: identity, pointerId: event.pointerId,
      startX: event.clientX, startY: event.clientY, active: false, targetIndex: null,
    };
    try { handle.setPointerCapture(event.pointerId); } catch { /* The pointer may already have left the document. */ }
  });
  root.addEventListener('pointermove', event => {
    const drag = pointerDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.active && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 5) return;
    if (!drag.active) {
      drag.active = true;
      root?.querySelector<HTMLElement>(`[data-fm-kind="${CSS.escape(drag.key)}"]`)?.closest('.frontmatter-field')?.classList.add('is-dragging');
    }
    event.preventDefault();
    const context = current(drag.key, drag.document);
    const row = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('.frontmatter-field');
    root?.querySelectorAll('.is-drop-target, .is-drop-after').forEach(item => item.classList.remove('is-drop-target', 'is-drop-after'));
    if (!context || !row || !root?.contains(row)) { drag.targetIndex = null; return; }
    const sourceIndex = context.analysis.fields.findIndex(field => field.key === drag.key);
    const rowIndex = context.analysis.fields.findIndex(field => field.key === row.dataset.key);
    if (sourceIndex < 0 || rowIndex < 0) { drag.targetIndex = null; return; }
    const after = event.clientY >= row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2;
    const boundary = rowIndex + (after ? 1 : 0);
    const targetIndex = Math.max(0, Math.min(context.analysis.fields.length - 1, boundary > sourceIndex ? boundary - 1 : boundary));
    drag.targetIndex = targetIndex;
    if (targetIndex !== sourceIndex) {
      row.classList.add('is-drop-target');
      row.classList.toggle('is-drop-after', after);
    }
  });
  root.addEventListener('pointerup', event => {
    const drag = pointerDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    pointerDrag = null;
    if (!drag.active) return;
    event.preventDefault();
    suppressDragClick = { key: drag.key, until: performance.now() + 500 };
    window.setTimeout(() => { if (suppressDragClick?.key === drag.key) suppressDragClick = null; }, 500);
    const context = current(drag.key, drag.document);
    const targetIndex = drag.targetIndex;
    clearDrag();
    if (!context || targetIndex === null) return;
    const sourceIndex = context.analysis.fields.findIndex(field => field.key === drag.key);
    if (sourceIndex === targetIndex) return;
    attempt(() => apply(reorderFrontmatterField(context.source, drag.key, targetIndex), true));
    inputFor('data-fm-kind', drag.key)?.focus();
  });
  root.addEventListener('pointercancel', clearDrag);
  root.addEventListener('lostpointercapture', event => {
    if (pointerDrag?.pointerId === (event as PointerEvent).pointerId) clearDrag();
  });
  store.on('editor:update', () => update());
  document.addEventListener('markflow:detach-document', () => { clearDrag(); identity = ''; signature = ''; });
  update();
}
export function refreshFrontmatterPanel(markdown?: string): void { update(markdown); }
export function openNewFrontmatterField(): void {
  update(); if (!editable() || root?.hidden) return;
  adding = true; addingKind = 'text'; addingArrayValues = []; collapsed = false; update(getMarkdown(), true);
  root?.querySelector<HTMLInputElement>('[name="key"]')?.focus();
}
