import { deflateRaw } from 'pako';
import { fetch } from '@tauri-apps/plugin-http';

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_SOURCE_BYTES = 512 * 1024;
const MAX_SVG_BYTES = 2 * 1024 * 1024;
const PLANTUML_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';

/** Module-level cache: key = `${serverUrl}\0${source}`, value = cleaned SVG. */
const svgCache = new Map<string, string>();

/** Clear the SVG cache (exported for testing). */
export function clearSvgCache(): void {
  svgCache.clear();
}

function encode6bit(value: number): string {
  return PLANTUML_ALPHABET[value & 0x3f];
}

/** Encodes raw DEFLATE data in PlantUML's URL-safe alphabet. */
export function encodePlantUml(source: string): string {
  const bytes = new TextEncoder().encode(source);
  if (bytes.byteLength > MAX_SOURCE_BYTES) throw new Error('PlantUML 源码过大（最大 512KB）');
  const compressed = deflateRaw(bytes, { level: 9 });
  let output = '';
  for (let index = 0; index < compressed.length; index += 3) {
    const b1 = compressed[index];
    const b2 = compressed[index + 1] ?? 0;
    const b3 = compressed[index + 2] ?? 0;
    output += encode6bit(b1 >> 2);
    output += encode6bit(((b1 & 0x3) << 4) | (b2 >> 4));
    output += encode6bit(((b2 & 0xf) << 2) | (b3 >> 6));
    output += encode6bit(b3);
  }
  return output;
}

export function buildPlantUmlSvgUrl(serverUrl: string, source: string): string {
  let base: URL;
  try {
    base = new URL(serverUrl.trim());
  } catch {
    throw new Error('PlantUML 服务器地址无效');
  }
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) {
    throw new Error('PlantUML 服务器地址必须是 HTTP 或 HTTPS 地址');
  }
  if (base.hostname.endsWith('plantuml.com') && base.pathname === '/') base.pathname = '/plantuml/';
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  return new URL(`svg/${encodePlantUml(source)}`, base).toString();
}

/** Returns true if the source is effectively empty (whitespace or bare @startuml/@enduml). */
export function isBlankPlantUmlSource(source: string): boolean {
  const stripped = source
    .replace(/@start\w*/gi, '')
    .replace(/@end\w*/gi, '')
    .trim();
  return stripped.length === 0;
}

async function readTextWithLimit(response: Response, limit: number): Promise<string> {
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (declared > limit) throw new Error('PlantUML 返回内容过大');
  if (!response.body) return response.text();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new Error('PlantUML 返回内容过大');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(merged);
}

/** Strip style declarations that reference external URLs, keeping safe ones. */
function sanitizeStyleValue(value: string): string {
  return value
    .split(';')
    .map(decl => decl.trim())
    .filter(decl => !/url\s*\(/i.test(decl))
    .join('; ');
}

export function sanitizePlantUmlSvg(svg: string): string {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  if (doc.querySelector('parsererror') || root.tagName.toLowerCase() !== 'svg') {
    throw new Error('PlantUML 返回了无效 SVG');
  }
  // Remove dangerous elements including <style>
  root.querySelectorAll('script, iframe, object, embed, audio, video, foreignObject, style').forEach(node => node.remove());
  [root, ...root.querySelectorAll('*')].forEach(node => {
    for (const attr of Array.from(node.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if (name.startsWith('on') || ((name === 'href' || name === 'xlink:href') && value && !value.startsWith('#'))) {
        node.removeAttribute(attr.name);
      } else if (name === 'style') {
        // Strip only declarations containing url(), keep safe styles
        const cleaned = sanitizeStyleValue(attr.value);
        if (cleaned.length === 0) {
          node.removeAttribute(attr.name);
        } else {
          node.setAttribute(attr.name, cleaned);
        }
      }
    }
  });
  return root.outerHTML;
}

export async function renderPlantUmlSvg(serverUrl: string, source: string): Promise<string> {
  // Check cache first
  const cacheKey = `${serverUrl}\0${source}`;
  const cached = svgCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(buildPlantUmlSvgUrl(serverUrl, source), {
      method: 'GET',
      signal: controller.signal,
      maxRedirections: 0,
      headers: { Accept: 'image/svg+xml' },
      referrerPolicy: 'no-referrer',
      connectTimeout: REQUEST_TIMEOUT_MS,
    });
    if (!response.ok) throw new Error(`PlantUML 服务器请求失败（HTTP ${response.status}）`);
    const svg = sanitizePlantUmlSvg(await readTextWithLimit(response, MAX_SVG_BYTES));
    svgCache.set(cacheKey, svg);
    return svg;
  } catch (error) {
    if ((error instanceof DOMException && error.name === 'AbortError')
      || (error instanceof Error && error.message === 'Request cancelled')) {
      throw new Error('PlantUML 渲染超时（超过 10 秒）');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
