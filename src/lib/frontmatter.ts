import { parseDocument } from 'yaml';

export type FrontmatterValue = string | number | boolean | null | string[] | number[] | boolean[];
export type FrontmatterKind = 'text' | 'number' | 'boolean' | 'null' | 'date' | 'array';

export interface FrontmatterBlock {
  bom: string;
  eol: '\n' | '\r\n';
  from: number;
  to: number;
  yamlFrom: number;
  yamlTo: number;
  yaml: string;
  bodyFrom: number;
}

export interface FrontmatterField {
  key: string;
  value: FrontmatterValue;
  kind: FrontmatterKind;
  /** Absolute source range of the complete mapping entry, including its newline. */
  from: number;
  to: number;
  /** Absolute source range of the value only. */
  valueFrom: number;
  valueTo: number;
  arrayStyle?: 'flow' | 'block';
  arrayElementKind?: Exclude<FrontmatterKind, 'array' | 'null'>;
}

export type FrontmatterAnalysis =
  | { supported: true; block: FrontmatterBlock; fields: FrontmatterField[] }
  | { supported: false; block: FrontmatterBlock | null; reason: string };

interface Line { text: string; from: number; to: number; }

function lines(source: string, from = 0): Line[] {
  const result: Line[] = [];
  let start = 0;
  while (start <= source.length) {
    const nl = source.indexOf('\n', start);
    const end = nl < 0 ? source.length : nl;
    result.push({ text: source.slice(start, end).replace(/\r$/, ''), from: from + start, to: from + (nl < 0 ? end : nl + 1) });
    if (nl < 0) break;
    start = nl + 1;
  }
  return result;
}

/** Finds only a complete delimiter-bounded block at document start (after BOM). */
export function extractFrontmatter(source: string): FrontmatterBlock | null {
  const bom = source.startsWith('\uFEFF') ? '\uFEFF' : '';
  const offset = bom.length;
  const all = lines(source.slice(offset), offset);
  if (all.length < 2 || !/^---[\t ]*$/.test(all[0].text)) return null;
  for (let i = 1; i < all.length; i += 1) {
    if (/^---[\t ]*$/.test(all[i].text)) {
      const eol: '\n' | '\r\n' = source.slice(all[0].from, all[0].to).endsWith('\r\n') ? '\r\n' : '\n';
      return {
        bom, eol, from: offset, to: all[i].to,
        yamlFrom: all[0].to, yamlTo: all[i].from,
        yaml: source.slice(all[0].to, all[i].from), bodyFrom: all[i].to,
      };
    }
  }
  return null;
}

export function createEmptyFrontmatter(source: string): string {
  if (extractFrontmatter(source)) return source;
  const bom = source.startsWith('\uFEFF') ? '\uFEFF' : '';
  const body = source.slice(bom.length);
  const eol: '\n' | '\r\n' = body.includes('\r\n') ? '\r\n' : '\n';
  return `${bom}---${eol}---${eol}${body ? eol : ''}${body}`;
}

function isDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

const NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
function classifyScalar(raw: string): { kind: Exclude<FrontmatterKind, 'array'>; value: string | number | boolean | null } | null {
  const text = raw.trim();
  if (!text) return null;
  if (/^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*')$/.test(text)) {
    const doc = parseDocument(`x: ${text}`, { schema: 'core' });
    if (doc.errors.length) return null;
    return { kind: 'text', value: String((doc.toJS() as { x: unknown }).x) };
  }
  if (text === 'true' || text === 'false') return { kind: 'boolean', value: text === 'true' };
  if (text === 'null' || text === '~') return { kind: 'null', value: null };
  if (NUMBER.test(text) && Number.isFinite(Number(text))) return { kind: 'number', value: Number(text) };
  if (isDate(text)) return { kind: 'date', value: text };
  if (/^[&*!]|[\[\]{},#]|\s:\s/.test(text)) return null;
  return { kind: 'text', value: text };
}

/**
 * A bare "key: value" round-trip must re-resolve to exactly `value`. Values
 * that YAML 1.2 Core resolves to a non-string scalar ("00" → 0, "+5" → 5,
 * "0x1F" → 31) or loses bytes from (trailing whitespace/newline, leading
 * space) must be double-quoted so the UI value round-trips losslessly.
 */
function needsQuoting(value: string): boolean {
  if (!value) return true;
  // Mirrors classifyScalar's rejection set: even though YAML itself tolerates
  // e.g. a plain "a, b" mapping value, this editor's safe subset does not, so
  // such values must be quoted to stay re-parseable by this very classifier.
  if (/[&*!]|[\[\]{},#]|\s:\s/.test(value)) return true;
  const doc = parseDocument(`k: ${value}`, { schema: 'core' });
  if (doc.errors.length || doc.contents == null) return true;
  const parsed = (doc.toJS() as { k?: unknown }).k;
  return typeof parsed !== 'string' || parsed !== value;
}

function quoteText(value: string): string {
  if (needsQuoting(value)) return JSON.stringify(value);
  return value;
}

export function serializeValue(value: FrontmatterValue, kind: FrontmatterKind, style?: 'flow' | 'block', eol = '\n', arrayElementKind?: Exclude<FrontmatterKind, 'array' | 'null'>): string {
  if (kind === 'array') {
    const values = value as Array<string | number | boolean>;
    const encoded = values.map(item => arrayElementKind === 'date' ? String(item) : quoteText(String(item)));
    return style === 'block' ? encoded.map(item => `- ${item}`).join(eol) : `[${encoded.join(', ')}]`;
  }
  if (kind === 'text' || kind === 'date') return kind === 'date' ? String(value) : quoteText(String(value));
  if (kind === 'null') return 'null';
  if (kind === 'boolean') return value ? 'true' : 'false';
  if (kind === 'number' && typeof value === 'number' && Number.isFinite(value)) return String(value);
  throw new Error('Unsupported frontmatter value');
}

function parseKey(raw: string): string | null {
  const key = raw.trim();
  if (!key || key === '<<') return null;
  if (/^[^\s:#\[\]{},][^:#\[\]{},]*$/.test(key)) return key;
  if (/^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*')$/.test(key)) {
    const doc = parseDocument(`${key}: x`, { schema: 'core' });
    const value = doc.toJS();
    const parsed = Object.keys(value ?? {})[0];
    return typeof parsed === 'string' && parsed ? parsed : null;
  }
  return null;
}

/**
 * Absolute source offset of the first value character on `line`. The separator
 * colon sits directly after the captured key (match[1] starts at the first
 * char), so the lead offset is independent of any colon inside a quoted key
 * ("a:b": v) or of a value substring shared with the key (a c: c).
 */
function valueStartOffset(line: Line, match: RegExpExecArray): number {
  const lead = match[1].length + 1;
  const rest = match[2];
  const first = rest.search(/\S/);
  return line.from + lead + (first < 0 ? rest.length : first);
}

/**
 * Flow `[..]` values are parsed by the real YAML parser so that a quoted comma
 * inside an element ("a,b") is not split apart. Returns the homogeneous typed
 * elements, or null when the array contains unsupported nested/shared types.
 */
function parseFlowArray(raw: string): { value: FrontmatterValue; elementKind: Exclude<FrontmatterKind, 'array' | 'null'> | undefined } | null {
  const doc = parseDocument(`v: ${raw}`, { schema: 'core' });
  if (doc.errors.length) return null;
  const arr = (doc.toJS() as { v?: unknown }).v;
  if (!Array.isArray(arr)) return null;
  if (!arr.every(x => (typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean') && !(typeof x === 'string' && x === ''))) return null;
  const kinds: (Exclude<FrontmatterKind, 'array' | 'null'>)[] = arr.map(x => typeof x === 'boolean' ? 'boolean' : typeof x === 'number' ? 'number' : 'text');
  if (new Set(kinds).size > 1) return null;
  // Elements are provably homogeneous above, so the mixed tuple is a safe
  // FrontmatterValue (string[] | number[] | boolean[]).
  return { value: arr as FrontmatterValue, elementKind: kinds[0] };
}

/** Conservative YAML 1.2 Core safe-subset classifier. */
export function analyzeFrontmatter(source: string): FrontmatterAnalysis {
  const block = extractFrontmatter(source);
  if (!block) return { supported: false, block: null, reason: '未检测到完整的文档开头 Frontmatter' };
  const doc = parseDocument(block.yaml, { schema: 'core', uniqueKeys: true, prettyErrors: false });
  if (doc.errors.length) return { supported: false, block, reason: 'YAML 语法无效' };
  if (doc.contents == null) return { supported: true, block, fields: [] };
  const localLines = lines(block.yaml, block.yamlFrom);
  const fields: FrontmatterField[] = [];
  const keys = new Set<string>();
  for (let i = 0; i < localLines.length; i += 1) {
    const line = localLines[i];
    if (!line.text.trim() || /^\s*#/.test(line.text)) continue;
    if (/^\s/.test(line.text)) return { supported: false, block, reason: '不支持嵌套 YAML 结构' };
    // Quoted keys may contain the colon separator themselves ("a:b": v), so
    // the key portion must accept a quoted form before falling back to plain.
    const match = /^("[^"]*"|'[^']*'|[^:]+):(.*)$/.exec(line.text);
    if (!match) return { supported: false, block, reason: '仅支持顶层键值映射' };
    const key = parseKey(match[1]);
    if (!key) return { supported: false, block, reason: '键必须是非空字符串且不能使用合并键' };
    if (keys.has(key)) return { supported: false, block, reason: 'YAML 键不能重复' };
    keys.add(key);
    const raw = match[2].trim();
    const valueStart = valueStartOffset(line, match);
    if (raw.startsWith('[') && raw.endsWith(']')) {
      if (raw.includes('#')) return { supported: false, block, reason: '数组中不支持注释' };
      const flow = parseFlowArray(raw);
      if (!flow) return { supported: false, block, reason: '数组必须是无注释的同类型非空标量' };
      fields.push({ key, value: flow.value, kind: 'array', from: line.from, to: line.to, valueFrom: valueStart, valueTo: line.from + line.text.length, arrayStyle: 'flow', arrayElementKind: flow.elementKind });
      continue;
    }
    if (!raw) {
      const arrayLines: Line[] = [];
      let j = i + 1;
      while (j < localLines.length && /^\s*-\s+/.test(localLines[j].text)) { arrayLines.push(localLines[j]); j += 1; }
      if (!arrayLines.length) return { supported: false, block, reason: '不支持空值或嵌套结构' };
      const items = arrayLines.map(l => classifyScalar(l.text.replace(/^\s*-\s+/, '')));
      if (items.some(x => !x || x.kind === 'null') || new Set(items.map(x => x!.kind)).size > 1 || arrayLines.some(l => l.text.includes('#'))) return { supported: false, block, reason: '数组必须是无注释的同类型非空标量' };
      const lastArrayLine = arrayLines[arrayLines.length - 1];
      fields.push({ key, value: items.map(x => x!.value) as FrontmatterValue, kind: 'array', from: line.from, to: lastArrayLine.to, valueFrom: arrayLines[0].from, valueTo: lastArrayLine.to, arrayStyle: 'block', arrayElementKind: items[0]?.kind as Exclude<FrontmatterKind, 'array' | 'null'> | undefined });
      i += arrayLines.length;
      continue;
    }
    const scalar = classifyScalar(raw);
    if (!scalar) return { supported: false, block, reason: '包含不支持的 YAML 值或标记' };
    fields.push({ key, value: scalar.value, kind: scalar.kind, from: line.from, to: line.to, valueFrom: valueStart, valueTo: line.from + line.text.length });
  }
  return { supported: true, block, fields };
}

function replace(source: string, from: number, to: number, text: string): string { return source.slice(0, from) + text + source.slice(to); }
function supported(source: string): Extract<FrontmatterAnalysis, { supported: true }> | null { const result = analyzeFrontmatter(source); return result.supported ? result : null; }

export function patchFrontmatterField(source: string, key: string, value: FrontmatterValue, kind: FrontmatterKind): string | null {
  const result = supported(source); const field = result?.fields.find(x => x.key === key);
  if (!result || !field) return null;
  if (kind === 'array') {
    // Array target keeps the field's historical presentation (block vs flow).
    const serialized = serializeValue(value, 'array', field.arrayStyle, result.block.eol, field.arrayElementKind);
    if (field.arrayStyle === 'block') return replace(source, field.from, field.to, `${key}:${result.block.eol}${serialized}${result.block.eol}`);
    return replace(source, field.from, field.to, `${key}: ${serialized}${source.slice(field.valueTo, field.to)}`);
  }
  // Scalar target: emit a single "key: value" line regardless of historical
  // array style. The old block form spans multiple lines; replacing the whole
  // field range collapses it to one scalar line while keeping the trailing
  // newline so the following mapping entry is preserved.
  const serialized = serializeValue(value, kind, undefined, result.block.eol);
  return replace(source, field.from, field.to, `${key}: ${serialized}${result.block.eol}`);
}

export function renameFrontmatterField(source: string, key: string, nextKey: string): string | null {
  const result = supported(source);
  const field = result?.fields.find(item => item.key === key);
  const rawKey = nextKey.trim();
  const parsedKey = parseKey(rawKey);
  if (!result || !field || !parsedKey || result.fields.some(item => item.key !== key && item.key === parsedKey)) return null;
  if (parsedKey === key) return source;
  const prefix = source.slice(field.from, field.valueFrom);
  const separator = prefix.indexOf(':');
  if (separator < 0) return null;
  return replace(source, field.from, field.from + separator, rawKey);
}

export function addFrontmatterField(source: string, key: string, value: FrontmatterValue, kind: FrontmatterKind): string | null {
  const result = supported(source);
  if (!result || !parseKey(key) || result.fields.some(x => x.key === key)) return null;
  const text = `${key}: ${serializeValue(value, kind, 'flow', result.block.eol)}${result.block.eol}`;
  return replace(source, result.block.yamlTo, result.block.yamlTo, text);
}

export function removeFrontmatterField(source: string, key: string): string | null { const result = supported(source); const field = result?.fields.find(x => x.key === key); return result && field ? replace(source, field.from, field.to, '') : null; }

export function reorderFrontmatterField(source: string, key: string, targetIndex: number): string | null {
  const result = supported(source); if (!result) return null;
  const index = result.fields.findIndex(x => x.key === key); if (index < 0 || targetIndex < 0 || targetIndex >= result.fields.length || index === targetIndex) return source;
  const field = result.fields[index]; const entry = source.slice(field.from, field.to); const removed = replace(source, field.from, field.to, '');
  const remaining = result.fields.filter((_, i) => i !== index); const anchor = remaining[targetIndex > index ? targetIndex - 1 : targetIndex];
  const shift = field.to - field.from; const at = targetIndex > index ? anchor.to - shift : anchor.from;
  return replace(removed, at, at, entry);
}