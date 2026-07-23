import { readFileAsBase64 } from './storage';
import { logDebug } from './logger';

/**
 * Build a read-only export snapshot from the editor's rendered root.
 * Preserves the `.ProseMirror` root container with `data-theme` attribute,
 * so `.ProseMirror ...` content selectors naturally match in the export.
 * All preprocessing (image conversion, editor markup cleanup) happens on
 * a cloned DOM subtree — the live editor DOM is never modified.
 *
 * Returns a DocumentFragment containing the cloned `.ProseMirror` div.
 */
export async function buildExportSnapshot(
  renderedRoot: HTMLElement,
): Promise<DocumentFragment> {
  // Clone the entire .ProseMirror root (not just children) to preserve
  // class name and data-theme attribute for CSS selector matching
  const clonedRoot = renderedRoot.cloneNode(true) as HTMLElement;

  // Preserve data-theme from the live editor
  const currentTheme = renderedRoot.getAttribute('data-theme');
  if (currentTheme) {
    clonedRoot.setAttribute('data-theme', currentTheme);
  }

  // Ensure the ProseMirror class is present
  if (!clonedRoot.classList.contains('ProseMirror')) {
    clonedRoot.classList.add('ProseMirror');
  }

  // Create a fragment and insert the cloned root
  const fragment = document.createDocumentFragment();
  fragment.appendChild(clonedRoot);

  cleanupEditorMarkup(fragment);
  await convertLocalImages(fragment);
  await waitForMediaReady(fragment);

  return fragment;
}

/**
 * Wait for document fonts to be ready, with a timeout.
 * Returns after fonts are loaded or after the timeout (whichever comes first).
 * Silently resolves if `document.fonts` is unavailable (e.g. in test environments).
 */
export async function waitForFontsReady(timeoutMs = 10_000): Promise<void> {
  try {
    // document.fonts may not exist in jsdom/happy-dom test environments
    const fontsReady = document.fonts?.ready;
    if (!fontsReady) return;

    await Promise.race([
      fontsReady,
      new Promise<void>(resolve => setTimeout(resolve, timeoutMs)),
    ]);
  } catch {
    // Ignore errors — proceed with whatever fonts are available
  }
}

/**
 * Remove editor-specific markup from the cloned snapshot:
 * - contenteditable, draggable attributes
 * - NodeView control elements (by data attribute or class)
 * - Tiptap/ProseMirror internal classes and data attributes
 */
export function cleanupEditorMarkup(root: DocumentFragment | Element): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null);
  const elementsToProcess: Element[] = [];

  // Collect first, then modify (TreeWalker is live)
  let node: Node | null;
  while ((node = walker.nextNode())) {
    elementsToProcess.push(node as Element);
  }

  for (const el of elementsToProcess) {
    // Remove contenteditable
    el.removeAttribute('contenteditable');
    el.removeAttribute('draggable');

    // Remove Tiptap/ProseMirror data attributes
    el.removeAttribute('data-node-view-wrapper');
    el.removeAttribute('data-drag-handle');

    // Remove ProseMirror guide classes
    el.classList.forEach(cls => {
      if (cls.startsWith('ProseMirror-') || cls.startsWith('tiptap-')) {
        el.classList.remove(cls);
      }
    });

    // Remove empty class attribute
    if (el.hasAttribute('class') && el.getAttribute('class')?.trim() === '') {
      el.removeAttribute('class');
    }
  }

  // Remove NodeView control wrappers (tiptap __react- or __vue- nodes)
  const controls = root.querySelectorAll(
    '[data-node-view-content], [contenteditable="false"]',
  );
  controls.forEach(el => {
    // Only remove if it looks like an editor control, not meaningful content
    if (
      el.getAttribute('role') === 'button' ||
      el.classList.contains('node-view-control') ||
      el.closest('[data-node-view-wrapper]')
    ) {
      el.remove();
    }
  });

  // Remove NodeView wrapper spans that only contain controls
  const wrappers = root.querySelectorAll('[data-node-view-wrapper]');
  wrappers.forEach(w => {
    // Replace wrapper with its children if it has meaningful content
    const parent = w.parentNode;
    if (parent) {
      while (w.firstChild) {
        parent.insertBefore(w.firstChild, w);
      }
      parent.removeChild(w);
    }
  });
}

/**
 * Convert asset:// protocol image URLs to data URIs in the cloned fragment.
 */
async function convertLocalImages(root: DocumentFragment | Element): Promise<void> {
  const images = root.querySelectorAll('img');
  const conversions: Promise<void>[] = [];

  images.forEach(img => {
    const src = img.getAttribute('src');
    if (!src || !src.startsWith('asset://')) return;

    const promise = (async () => {
      try {
        const fsPath = assetUrlToFsPath(src);
        const base64 = await readFileAsBase64(fsPath);
        const mimeType = inferMimeType(src);
        img.setAttribute('src', `data:${mimeType};base64,${base64}`);
      } catch (error) {
        logDebug('export.snapshot', 'Failed to convert image to data URI, keeping original', { src, error: String(error) });
      }
    })();

    conversions.push(promise);
  });

  await Promise.all(conversions);
}

/**
 * Wait for fonts and images to be ready in the snapshot.
 * The fragment must be attached to the document briefly for font loading detection.
 * Returns a cleanup function to detach the temporary container.
 */
export async function waitForMediaReady(root: DocumentFragment | Element): Promise<void> {
  const images = root.querySelectorAll('img');
  const decodePromises: Promise<void>[] = [];

  images.forEach(img => {
    if (img.complete && img.naturalWidth > 0) return;
    // We can't call img.decode() on a detached image reliably,
    // but we can wait for load events via a temporary container
    if (!img.complete) {
      const p = new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve(); // don't block on error
      });
      decodePromises.push(p);
    }
  });

  await Promise.all(decodePromises);
}

function assetUrlToFsPath(assetUrl: string): string {
  // asset://localhost/path/to/image.png → /path/to/image.png
  let path = assetUrl.replace(/^asset:\/\/localhost/, '');
  // URL-decode the path
  path = decodeURIComponent(path);
  // On Windows asset://localhost/C:/ → /C:/ → C:/
  if (path.match(/^\/[A-Za-z]:\//)) path = path.slice(1);
  return path;
}

function inferMimeType(src: string): string {
  const ext = src.split('.').pop()?.toLowerCase() ?? '';
  const mimeMap: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    bmp: 'image/bmp',
    ico: 'image/x-icon',
  };
  return mimeMap[ext] ?? 'image/png';
}

/**
 * Convert SVG elements (e.g. Mermaid, PlantUML) to PNG data URIs
 * using Canvas rendering. Useful for DOCX export which doesn't support SVG.
 */
export async function convertSvgToPngDataUrl(
  svgElement: SVGElement,
  width?: number,
  height?: number,
): Promise<string> {
  const svgClone = svgElement.cloneNode(true) as SVGElement;

  // Ensure explicit sizing
  const w = width || parseInt(svgElement.getAttribute('width') || '800', 10) || 800;
  const h = height || parseInt(svgElement.getAttribute('height') || '600', 10) || 600;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas 2d context');

  // Serialize SVG and create a blob URL
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svgClone);
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      ctx!.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load SVG on canvas'));
    };
    img.src = url;
  });
}
