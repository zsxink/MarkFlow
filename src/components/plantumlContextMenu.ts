import { savePlantUmlPngExport, savePlantUmlSvgExport } from '../lib/storage';
import { showDiagramContextMenu } from './diagramContextMenu';

interface PlantumlContextMenuState {
  svg: string;
  defaultName: string;
}

export function showPlantumlContextMenu(x: number, y: number, state: PlantumlContextMenuState) {
  showDiagramContextMenu(x, y, state, 'plantuml-context-menu', {
    saveSvg: savePlantUmlSvgExport,
    savePng: savePlantUmlPngExport,
  });
}
