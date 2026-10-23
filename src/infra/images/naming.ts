// ── Image naming ──────────────────────────────────────────────────────
// Pure helpers: template rendering, extension resolution, collision-free names.
// No draft state, no storage I/O — see `draft.ts` and `core.ts`.

import { DEFAULT_IMAGE_SETTINGS } from '../../types/image';
import {
  computeRelativePath,
  getDocumentBaseName,
  getFileName,
} from '../../utils/paths';

const SUPPORTED_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp']);
const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
};

export function renderClipboardNameTemplate(
  template: string,
  docPath: string | null,
  now: Date = new Date(),
  fallbackTemplate = DEFAULT_IMAGE_SETTINGS.clipboardNameTemplate,
): string {
  const documentName = docPath ? getDocumentBaseName(docPath) || 'untitled' : 'untitled';
  const rendered = (template.trim() || fallbackTemplate)
    .replace(/\$\{filename\}/g, documentName)
    .replace(/\$\{date:([^{}]+)\}/g, (_match, format: string) => formatDateTime(now, format))
    .replace(/\$\{time:([^{}]+)\}/g, (_match, format: string) => formatDateTime(now, format))
    .replace(/\$\{[^{}]*\}/g, '');
  return sanitizeBaseName(removeImageExtension(rendered), 'img');
}

export function getImageExtension(mimeType: string, fallbackName = ''): string {
  const normalizedMime = mimeType.split(';', 1)[0].trim().toLowerCase();
  const fromMime = MIME_EXTENSIONS[normalizedMime];
  if (fromMime) return fromMime;
  const fromName = getExtension(fallbackName);
  return SUPPORTED_EXTENSIONS.has(fromName) ? fromName : 'png';
}

export function generateClipboardImageName(
  template: string,
  mimeType: string,
  docPath: string | null,
  existingNames: readonly string[] = [],
  now: Date = new Date(),
  fallbackName = '',
  fallbackTemplate = DEFAULT_IMAGE_SETTINGS.clipboardNameTemplate,
): string {
  const base = renderClipboardNameTemplate(template, docPath, now, fallbackTemplate);
  return pickAvailableName(`${base}.${getImageExtension(mimeType, fallbackName)}`, existingNames);
}

/** Preserve a local/network source name and add an index only on collision. */
export function generateSourceImageName(
  sourceName: string,
  existingNames: readonly string[] = [],
  mimeType = '',
): string {
  const fileName = decodeFileName(getFileName(sourceName)) || 'image';
  const rawExtension = getRawExtension(fileName);
  const extension = mimeType
    ? getImageExtension(mimeType, fileName)
    : (SUPPORTED_EXTENSIONS.has(rawExtension.toLowerCase()) ? rawExtension : 'png');
  const base = sanitizeBaseName(stripExtension(fileName), 'image');
  return pickAvailableName(`${base}.${extension}`, existingNames);
}

/** Turn an absolute image path into the reference written into Markdown. */
export function toImageReference(destPath: string, docPath: string | null, style: string): string {
  const normalized = destPath.replace(/\\/g, '/');
  if (style === 'absolute' || !docPath) return normalized;
  return computeRelativePath(docPath, normalized);
}

export function getUrlFileName(url: string): string {
  const fileName = new URL(url).pathname.split('/').pop() || 'image';
  return decodeFileName(fileName);
}

export function getUrlExtension(url: string): string | null {
  const extension = getExtension(getUrlFileName(url));
  return SUPPORTED_EXTENSIONS.has(extension) ? extension : null;
}

function formatDateTime(date: Date, format: string): string {
  const tokens: Record<string, string> = {
    yyyy: String(date.getFullYear()).padStart(4, '0'),
    yy: String(date.getFullYear()).slice(-2),
    MM: String(date.getMonth() + 1).padStart(2, '0'),
    M: String(date.getMonth() + 1),
    dd: String(date.getDate()).padStart(2, '0'),
    d: String(date.getDate()),
    HH: String(date.getHours()).padStart(2, '0'),
    H: String(date.getHours()),
    mm: String(date.getMinutes()).padStart(2, '0'),
    m: String(date.getMinutes()),
    ss: String(date.getSeconds()).padStart(2, '0'),
    s: String(date.getSeconds()),
  };
  return format.replace(/yyyy|yy|MM|M|dd|d|HH|H|mm|m|ss|s/g, token => tokens[token]);
}

function sanitizeBaseName(name: string, fallback: string): string {
  let sanitized = name
    .normalize('NFC')
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '-')
    .replace(/[. ]+$/g, '')
    .replace(/^[. -]+/g, '')
    .trim();
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(sanitized)) sanitized = `img-${sanitized}`;
  return sanitized || fallback;
}

function removeImageExtension(name: string): string {
  const extension = getExtension(name);
  return SUPPORTED_EXTENSIONS.has(extension) ? stripExtension(name) : name;
}

function getExtension(name: string): string {
  return getRawExtension(name).toLowerCase();
}

function getRawExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1) : '';
}

function stripExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

function pickAvailableName(candidate: string, existingNames: readonly string[]): string {
  const occupied = new Set(existingNames.map(name => name.toLocaleLowerCase()));
  if (!occupied.has(candidate.toLocaleLowerCase())) return candidate;
  const dot = candidate.lastIndexOf('.');
  const base = dot >= 0 ? candidate.slice(0, dot) : candidate;
  const extension = dot >= 0 ? candidate.slice(dot) : '';
  let index = 1;
  while (occupied.has(`${base}-${index}${extension}`.toLocaleLowerCase())) index++;
  return `${base}-${index}${extension}`;
}

function decodeFileName(name: string): string {
  try { return decodeURIComponent(name); } catch { return name; }
}
