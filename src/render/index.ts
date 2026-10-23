// Barrel for the render layer: diagrams (Mermaid/PlantUML), KaTeX math and
// CodeMirror language/highlight helpers.
export { renderMermaid } from './mermaid';
export { renderPlantUml } from './plantuml';
export { renderKatex, type RenderedFormula } from './katex-render';
export { loadKatex } from './katex-lazy';
export { highlightLimitPlugin } from './codemirror-highlight-limit';
export { getLanguageExtension, hasLanguageLoader } from './codemirror-languages';
