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
