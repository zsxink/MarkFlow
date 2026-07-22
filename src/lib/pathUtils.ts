export function getFileName(filePath: string): string {
  const lastSep = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  return lastSep >= 0 ? filePath.substring(lastSep + 1) : filePath;
}

/** Return the final path segment without its last extension. */
export function getDocumentBaseName(filePath: string): string {
  const fileName = getFileName(filePath);
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

/** Resolve the single-level `<document-name>-images` directory beside a document. */
export function getDocumentNamedImageDir(documentPath: string): string {
  const parent = normalizePathSegments(getParentDir(documentPath));
  const baseName = getDocumentBaseName(documentPath) || 'untitled';
  const separator = parent.endsWith('/') ? '' : '/';
  return normalizePathSegments(`${parent}${separator}${baseName}-images`);
}

export function getParentDir(filePath: string): string {
  const lastSep = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  if (lastSep < 0) return '.';
  if (lastSep === 0) return filePath[0];
  if (lastSep === 2 && isWindowsDrivePath(filePath)) return filePath.substring(0, 3);
  return filePath.substring(0, lastSep);
}

export function isWindowsDrivePath(path: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(path);
}

export function isUNCPath(path: string): boolean {
  return path.startsWith('\\\\') || path.startsWith('//');
}

export function isAbsolutePath(path: string): boolean {
  return path.startsWith('/') || isWindowsDrivePath(path) || isUNCPath(path);
}

/**
 * Normalize an image storage path, supporting:
 * - Relative paths (./images, ../assets) resolved against doc dir
 * - POSIX absolute paths (/home/user/Pictures)
 * - Windows drive paths (D:\Pictures\MarkFlow)
 * - UNC paths (\\server\share\images)
 * All paths are converted to POSIX-style forward slashes.
 */
export function normalizeImageStoragePath(customPath: string, baseDir: string): string {
  const normalizedPath = normalizePathSegments(customPath);
  if (isAbsolutePath(normalizedPath)) return normalizedPath;
  return resolveImagePath(normalizedPath, baseDir);
}

export function resolveImagePath(imagePath: string, docPath: string): string {
  if (isAbsolutePath(imagePath)) return normalizePathSegments(imagePath);
  const docDir = normalizePathSegments(getParentDir(docPath));
  return normalizePathSegments(`${docDir}/${imagePath}`);
}

export function computeRelativePath(from: string, to: string): string {
  const fromDir = normalizePathSegments(getParentDir(from));
  const normalizedTo = normalizePathSegments(to);
  const fromRoot = getPathRoot(fromDir);
  const toRoot = getPathRoot(normalizedTo);
  if (fromRoot.toLowerCase() !== toRoot.toLowerCase()) return normalizedTo;

  const fromParts = stripPathRoot(fromDir, fromRoot).split('/').filter(Boolean);
  const toParts = stripPathRoot(normalizedTo, toRoot).split('/').filter(Boolean);
  let i = 0;
  const caseInsensitive = isWindowsDrivePath(fromDir) || isUNCPath(fromDir);
  while (i < fromParts.length && i < toParts.length
    && (caseInsensitive ? fromParts[i].toLowerCase() === toParts[i].toLowerCase() : fromParts[i] === toParts[i])) {
    i++;
  }
  const ups = fromParts.length - i;
  const rel = [...Array(ups).fill('..'), ...toParts.slice(i)];
  return rel.join('/') || '.';
}

/** Normalize `.` and `..` without consulting the host filesystem. */
export function normalizePathSegments(input: string): string {
  const path = input.trim().replace(/\\/g, '/');
  const root = getPathRoot(path);
  const rest = stripPathRoot(path, root);
  const parts: string[] = [];
  for (const part of rest.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (parts.length && parts[parts.length - 1] !== '..') parts.pop();
      else if (!root) parts.push('..');
      continue;
    }
    parts.push(part);
  }
  if (!root) return parts.join('/') || '.';
  if (root === '/') return `/${parts.join('/')}` || '/';
  if (root === '//') return `//${parts.join('/')}`;
  return `${root}${parts.join('/')}`;
}

function getPathRoot(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  if (normalized.startsWith('//')) {
    const [server, share] = normalized.slice(2).split('/');
    return server && share ? `//${server}/${share}/` : '//';
  }
  const drive = normalized.match(/^[a-zA-Z]:\//)?.[0];
  if (drive) return drive;
  return normalized.startsWith('/') ? '/' : '';
}

function stripPathRoot(path: string, root: string): string {
  return root ? path.replace(/\\/g, '/').slice(root.length) : path.replace(/\\/g, '/');
}

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
};

export function getImageMimeType(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot < 0) return 'application/octet-stream';
  const ext = filename.substring(dot).toLowerCase();
  return MIME_MAP[ext] || 'application/octet-stream';
}
