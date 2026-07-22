export function getFileName(filePath: string): string {
  const lastSep = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  return lastSep >= 0 ? filePath.substring(lastSep + 1) : filePath;
}

export function getParentDir(filePath: string): string {
  const lastSep = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  return lastSep > 0 ? filePath.substring(0, lastSep) : filePath;
}

export function isWindowsDrivePath(path: string): boolean {
  return /^[a-zA-Z]:/.test(path);
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
  const normalizedPath = customPath.replace(/\\/g, '/');
  // Absolute paths (POSIX, Windows drive, UNC) used as-is
  if (isWindowsDrivePath(normalizedPath) || normalizedPath.startsWith('/')) {
    return normalizedPath;
  }
  // Relative paths resolved against base dir
  if (normalizedPath.startsWith('./') || normalizedPath.startsWith('../')) {
    return resolveImagePath(normalizedPath, baseDir);
  }
  // Fallback: treat as relative
  return resolveImagePath(normalizedPath, baseDir);
}

export function resolveImagePath(imagePath: string, docPath: string): string {
  // Windows drive paths and POSIX absolute paths are used as-is
  if (isAbsolutePath(imagePath)) {
    return imagePath.replace(/\\/g, '/');
  }
  const docDir = getParentDir(docPath);
  const parts = imagePath.split('/');
  const docParts = docDir.split('/');
  for (const part of parts) {
    if (part === '.' || part === '') continue;
    if (part === '..') { docParts.pop(); }
    else { docParts.push(part); }
  }
  return docParts.join('/');
}

export function computeRelativePath(from: string, to: string): string {
  const fromParts = getParentDir(from).split('/');
  const toParts = to.split('/');
  let i = 0;
  while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) {
    i++;
  }
  const ups = fromParts.length - i;
  const rel = [...Array(ups).fill('..'), ...toParts.slice(i)];
  return rel.join('/');
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
