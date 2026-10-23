import { savePlantUmlPngExport, savePlantUmlSvgExport } from '../infra/storage';
import { showDiagramContextMenu } from './diagram-context-menu';

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
