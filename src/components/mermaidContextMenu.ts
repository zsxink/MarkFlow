import { saveMermaidPngExport, saveMermaidSvgExport } from '../lib/storage';
import { showDiagramContextMenu } from './diagramContextMenu';

interface MermaidContextMenuState {
  svg: string;
  defaultName: string;
}

export function showMermaidContextMenu(x: number, y: number, state: MermaidContextMenuState) {
  showDiagramContextMenu(x, y, state, 'mermaid-context-menu', {
    saveSvg: saveMermaidSvgExport,
    savePng: saveMermaidPngExport,
  });
}
