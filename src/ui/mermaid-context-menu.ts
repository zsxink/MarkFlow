import { saveMermaidPngExport, saveMermaidSvgExport } from '../infra/storage';
import { showDiagramContextMenu } from './diagram-context-menu';

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
