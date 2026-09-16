import { analyzeFrontmatter, patchFrontmatterField, renameFrontmatterField, addFrontmatterField, removeFrontmatterField, reorderFrontmatterField, type FrontmatterKind, type FrontmatterValue } from '../lib/frontmatter';
import { getMarkdown, applyFrontmatterMarkdown } from '../lib/editor';
import { store } from '../lib/store';

let root: HTMLElement | null = null;
let focusNewField = false;
let draggedKey: string | null = null;

function escape(value: string): string { const el = document.createElement('span'); el.textContent = value; return el.innerHTML; }
function editable(): boolean { return !store.getState().readOnly; }
function typeOptions(selected: FrontmatterKind): string {
  return (['text', 'array', 'number', 'boolean', 'date', 'null'] as FrontmatterKind[])
    .map(kind => `<option value="${kind}"${kind === selected ? ' selected' : ''}>${({ text: '文本', array: '列表', number: '数字', boolean: '布尔', date: '日期', null: '空值' } as Record<FrontmatterKind, string>)[kind]}</option>`)
    .join('');
}

function valueForKind(raw: string, kind: FrontmatterKind): FrontmatterValue {
  if (kind === 'array') return raw ? raw.split(',').map(item => item.trim()).filter(Boolean) : [];
  if (kind === 'number') return Number(raw);
  if (kind === 'boolean') return raw === 'true';
  if (kind === 'null') return null;
  return raw;
}

function arrayValue(field: { arrayElementKind?: FrontmatterKind }, values: string[]): FrontmatterValue {
  return values.map(value => field.arrayElementKind === 'number' ? Number(value) : field.arrayElementKind === 'boolean' ? value === 'true' : value) as FrontmatterValue;
}

function tagEditor(field: { key: string; value: FrontmatterValue }, disabled: string): string {
  const tags = field.value as Array<string | number | boolean>;
  const items = tags.map((tag, index) => `<span class="frontmatter-tag"><input data-fm-tag-value="${escape(field.key)}" data-fm-tag-index="${index}" value="${escape(String(tag))}" aria-label="${escape(field.key)} 标签 ${index + 1}"${disabled}><button type="button" data-fm-tag-remove="${escape(field.key)}" data-fm-tag-index="${index}" aria-label="删除标签 ${escape(String(tag))}"${disabled}>×</button></span>`).join('');
  return `<div class="frontmatter-tag-editor" aria-label="${escape(field.key)} 标签列表">${items}<span class="frontmatter-tag-add"><input data-fm-tag-new="${escape(field.key)}" placeholder="添加标签" aria-label="添加 ${escape(field.key)} 标签"${disabled}><button type="button" data-fm-tag-add="${escape(field.key)}" aria-label="添加标签"${disabled}>添加</button></span></div>`;
}

function update(markdown = getMarkdown()): void {
  if (!root) return;
  // Source mode owns the whole Markdown document through CodeMirror; it must
  // never show a second, WYSIWYG-only editing surface.
  if (store.getState().mode === 'source') { root.hidden = true; return; }
  const analysis = analyzeFrontmatter(markdown);
  if (!analysis.block) {
    // Creation lives exclusively in the top toolbar. Keep documents without
    // frontmatter visually unchanged in the WYSIWYG canvas.
    root.hidden = true;
    root.innerHTML = '';
    return;
  }
  root.hidden = false;
  const disabled = editable() ? '' : ' disabled';
  const raw = escape(analysis.block.yaml);
  if (!analysis.supported) {
    root.innerHTML = `<section class="frontmatter-panel frontmatter-fallback"><header><strong>Frontmatter · YAML 元数据</strong><span>可视化编辑不可用：${escape(analysis.reason)}</span></header><textarea aria-label="Frontmatter YAML 源码"${disabled}>${raw}</textarea></section>`;
  } else {
    const rows = analysis.fields.map((field, index) => {
      const value = field.kind === 'array' ? (field.value as unknown[]).join(', ') : String(field.value ?? '');
      const type = field.kind === 'boolean' ? 'checkbox' : field.kind === 'number' ? 'number' : field.kind === 'date' ? 'date' : 'text';
      const control = field.kind === 'array' ? tagEditor(field, disabled) : type === 'checkbox'
        ? `<input data-fm-value="${escape(field.key)}" type="checkbox" ${field.value ? 'checked' : ''}${disabled}>`
        : `<input data-fm-value="${escape(field.key)}" type="${type}" value="${escape(value)}"${disabled}>`;
      return `<div class="frontmatter-field" data-key="${escape(field.key)}" draggable="${editable()}" aria-label="字段 ${escape(field.key)}，可拖动排序"><input class="frontmatter-key-input" data-fm-key-value="${escape(field.key)}" value="${escape(field.key)}" aria-label="修改字段名 ${escape(field.key)}"${disabled}>${control}<select data-fm-kind="${escape(field.key)}" aria-label="${escape(field.key)} 的字段类型"${disabled}>${typeOptions(field.kind)}</select><button data-fm-remove="${escape(field.key)}" aria-label="删除 ${escape(field.key)}"${disabled}>删除</button><button data-fm-move="${index - 1}" data-fm-key="${escape(field.key)}" aria-label="上移 ${escape(field.key)}"${disabled || index === 0 ? ' disabled' : ''}>↑</button><button data-fm-move="${index + 1}" data-fm-key="${escape(field.key)}" aria-label="下移 ${escape(field.key)}"${disabled || index === analysis.fields.length - 1 ? ' disabled' : ''}>↓</button></div>`;
    }).join('');
    root.innerHTML = `<section class="frontmatter-panel"><header><strong>Frontmatter · YAML 元数据</strong><button data-fm-collapse aria-expanded="true">收起</button></header><div class="frontmatter-fields">${rows}</div><form data-fm-add><input name="key" placeholder="字段名" aria-label="新字段名"${disabled}><input name="value" placeholder="值；列表用逗号分隔" aria-label="新字段值"${disabled}><select name="kind" aria-label="字段类型"${disabled}><option value="text" selected>文本</option><option value="array">列表</option><option value="number">数字</option><option value="boolean">布尔</option><option value="date">日期</option><option value="null">空值</option></select><button${disabled}>新增</button></form><output class="frontmatter-live" aria-live="polite"></output></section>`;
  }
  if (focusNewField) { focusNewField = false; root.querySelector<HTMLInputElement>('[name="key"]')?.focus(); }
}

function apply(next: string | null): void { if (next !== null) { applyFrontmatterMarkdown(next); update(next); } }

export function mountFrontmatterPanel(container: HTMLElement): void {
  root = document.createElement('div'); root.id = 'frontmatter-region'; root.dataset.testid = 'frontmatter-region'; root.hidden = true;
  container.prepend(root);
  root.addEventListener('change', event => {
    if (!editable()) return;
    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    const source = getMarkdown(); const analysis = analyzeFrontmatter(source); if (!analysis.block) return;
    if (target.tagName === 'TEXTAREA') { apply(source.slice(0, analysis.block.yamlFrom) + target.value + source.slice(analysis.block.yamlTo)); return; }
    if (target.dataset.fmKeyValue) {
      const next = renameFrontmatterField(source, target.dataset.fmKeyValue, target.value);
      if (next === null) {
        target.setCustomValidity('字段名无效或已存在');
        target.reportValidity();
        return;
      }
      target.setCustomValidity('');
      apply(next);
      return;
    }
    if (target instanceof HTMLSelectElement && target.dataset.fmKind) {
      const field = analysis.supported && analysis.fields.find(item => item.key === target.dataset.fmKind);
      const input = root?.querySelector<HTMLInputElement>(`[data-fm-value="${CSS.escape(target.dataset.fmKind)}"]`);
      const tagInputs = root?.querySelectorAll<HTMLInputElement>(`[data-fm-tag-value="${CSS.escape(target.dataset.fmKind)}"]`);
      if (!field) return;
      const raw = input ? (input.type === 'checkbox' ? String(input.checked) : input.value) : tagInputs ? [...tagInputs].map(tag => tag.value).join(', ') : '';
      apply(patchFrontmatterField(source, field.key, valueForKind(raw, target.value as FrontmatterKind), target.value as FrontmatterKind));
      return;
    }
    if (target.dataset.fmTagValue) {
      const field = analysis.supported && analysis.fields.find(item => item.key === target.dataset.fmTagValue);
      const inputs = root?.querySelectorAll<HTMLInputElement>(`[data-fm-tag-value="${CSS.escape(target.dataset.fmTagValue)}"]`);
      if (!field || field.kind !== 'array' || !inputs) return;
      apply(patchFrontmatterField(source, field.key, arrayValue(field, [...inputs].map(input => input.value.trim()).filter(Boolean)), field.kind));
      return;
    }
    const key = target.dataset.fmValue; const field = analysis.supported && analysis.fields.find(x => x.key === key); if (!field) return;
    let value: FrontmatterValue = target instanceof HTMLInputElement && target.type === 'checkbox' ? target.checked : target.value;
    if (field.kind === 'number') value = Number(value);
    if (field.kind === 'array') value = arrayValue(field, String(value).split(',').map(x => x.trim()).filter(Boolean));
    apply(patchFrontmatterField(source, field.key, value, field.kind));
  });
  root.addEventListener('click', event => {
    if (!editable()) return;
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!button) return;
    const source = getMarkdown();
    if (button.dataset.fmTagRemove) {
      const analysis = analyzeFrontmatter(source);
      const field = analysis.supported ? analysis.fields.find(item => item.key === button.dataset.fmTagRemove) : undefined;
      const index = Number(button.dataset.fmTagIndex);
      if (field?.kind === 'array') apply(patchFrontmatterField(source, field.key, arrayValue(field, (field.value as unknown[]).map(String).filter((_, itemIndex) => itemIndex !== index)), field.kind));
    }
    if (button.dataset.fmTagAdd) {
      const analysis = analyzeFrontmatter(source);
      const field = analysis.supported ? analysis.fields.find(item => item.key === button.dataset.fmTagAdd) : undefined;
      const input = root?.querySelector<HTMLInputElement>(`[data-fm-tag-new="${CSS.escape(button.dataset.fmTagAdd)}"]`);
      const tag = input?.value.trim();
      if (field?.kind === 'array' && tag) apply(patchFrontmatterField(source, field.key, arrayValue(field, [...(field.value as unknown[]).map(String), tag]), field.kind));
    }
    if (button.dataset.fmRemove) apply(removeFrontmatterField(source, button.dataset.fmRemove));
    if (button.dataset.fmKey && button.dataset.fmMove) apply(reorderFrontmatterField(source, button.dataset.fmKey, Number(button.dataset.fmMove)));
    if (button.dataset.fmCollapse !== undefined) {
      const panel = root?.querySelector<HTMLElement>('.frontmatter-panel');
      const collapsed = panel?.classList.toggle('collapsed') ?? false;
      button.textContent = collapsed ? '展开' : '收起';
      button.setAttribute('aria-expanded', String(!collapsed));
    }
  });
  root.addEventListener('submit', event => {
    event.preventDefault(); if (!editable()) return;
    const form = event.target as HTMLFormElement;
    const data = new FormData(form);
    const key = String(data.get('key') ?? '').trim();
    const kind = String(data.get('kind') ?? 'text') as FrontmatterKind;
    const raw = String(data.get('value') ?? '').trim();
    const value = valueForKind(raw, kind);
    try { apply(addFrontmatterField(getMarkdown(), key, value, kind)); form.reset(); } catch { /* invalid typed value stays editable */ }
  });
  root.addEventListener('dragstart', event => { draggedKey = (event.target as HTMLElement).closest<HTMLElement>('.frontmatter-field')?.dataset.key ?? null; });
  root.addEventListener('dragover', event => { if (draggedKey && editable()) event.preventDefault(); });
  root.addEventListener('drop', event => {
    event.preventDefault(); const target = (event.target as HTMLElement).closest<HTMLElement>('.frontmatter-field');
    if (!draggedKey || !target || !editable()) return;
    const analysis = analyzeFrontmatter(getMarkdown()); if (!analysis.supported) return;
    const index = analysis.fields.findIndex(field => field.key === target.dataset.key);
    apply(reorderFrontmatterField(getMarkdown(), draggedKey, index));
    const live = root?.querySelector<HTMLOutputElement>('.frontmatter-live'); if (live) live.value = `已移动字段 ${draggedKey}`;
    draggedKey = null;
  });
  store.on('editor:update', () => update());
  update();
}

export function refreshFrontmatterPanel(markdown?: string): void { update(markdown); }
export function openNewFrontmatterField(): void { focusNewField = true; update(); }
