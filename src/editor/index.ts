// Barrel for the editor layer. UI and main import only from here; the
// implementation files (session, state, markdown/*, extensions/*, …) stay
// internal to this layer.

// ── Session / document lifecycle ──────────────────────────────────────
export {
  getMarkdownResult,
  getMarkdown,
  getSavePlan,
  getPipelineMode,
  resetEditorScroll,
  markDocumentPersisted,
  placeCaretAfterContentLoad,
  setMarkdown,
  applyFrontmatterMarkdown,
  switchToSource,
  switchToWysiwyg,
  degradeToSourceOnly,
  ensureContinuationParagraph,
  type MarkdownLoadOptions,
  type SavePlan,
} from './session';
export type { MarkdownSerializeResult } from './markdown/bridge';

// ── Editor bootstrap ─────────────────────────────────────────────────
export { initEditor, createMarkdownExtension, markflowMarked } from './init';

// ── Shared editor state ──────────────────────────────────────────────
export {
  assetToOriginalMap,
  getEditor,
  setEditor,
  getDocumentState,
  getMode,
  setMode,
  isDocumentDirty,
  hasExternalModification,
  markExternalModification,
  setActiveDocumentPath,
  getActiveDocPath,
  getMermaidExportBaseName,
  getPlantUmlExportBaseName,
  bumpRevision,
  getRevision,
  getLastReadMtime,
  getLastReadSize,
  hasLastReadStats,
  setLastReadStats,
  clearLastReadStats,
  bumpSourceRevision,
  getSourceRevision,
  getEditorDocumentVersion,
  advanceEditorDocumentVersion,
  withProgrammaticUpdate,
  isProgrammaticUpdate,
  getMarkdownPipelineMode,
  setMarkdownPipelineMode,
  resetDocumentState,
  type DocumentState,
} from './state';

// ── Document projection (attach/detach per tab) ──────────────────────
export {
  flushEditorDirtyCheck,
  commitEditorDocumentDrafts,
  detachEditorDocument,
  attachEditorDocument,
  resetEditorDocument,
  releaseEditorDocument,
  type EditorDocumentContext,
  type EditorDocumentProjection,
} from './context';

// ── Source (CodeMirror) facade ───────────────────────────────────────
export {
  createSourceEditor,
  destroySourceEditor,
  getSourceView,
  getSourceContent,
  setSourceContent,
  setSourceReadOnly,
  setSourceSoftWrap,
  setSourceHighlight,
  detachSourceDocument,
  attachSourceDocument,
  type SourceDocumentContext,
} from './source-facade';

// ── Reconcile boundary ───────────────────────────────────────────────
export { runSaveBoundary, shouldUseReconcileBoundary, shouldSuppressAutosave } from './save-reconcile';

// ── Stats ────────────────────────────────────────────────────────────
export { getWordCount, getLineCount, getCursorPos } from './stats';

// ── Extensions (Tiptap nodes used by tests and embedders) ────────────
export {
  CustomLink,
  SafeParagraph,
  escapeParagraphMarkdown,
  MarkdownSafeTable,
  parseTableInput,
  splitTableLine,
  BlockImage,
  mermaidCodeBlockExtension,
  renderFencedCodeBlock,
} from './extensions';
