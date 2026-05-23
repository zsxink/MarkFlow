export function getFileName(filePath: string): string {
  const lastSep = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  return lastSep >= 0 ? filePath.substring(lastSep + 1) : filePath;
}

export function getParentDir(filePath: string): string {
  const lastSep = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  return lastSep > 0 ? filePath.substring(0, lastSep) : filePath;
}

export function resolveImagePath(imagePath: string, docPath: string): string {
  if (/^[a-zA-Z]:/.test(imagePath) || imagePath.startsWith('/')) {
    return imagePath;
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
