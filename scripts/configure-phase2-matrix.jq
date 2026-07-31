# Applies the phase-2 capability configuration to matrix.json.
# Usage: jq -f configure-phase2-matrix.jq matrix.json > matrix.json.new
# The 16 phase-2 capabilities are the program-tracking scope for R0A; their
# owner, child change, flag and default are set here. All other specs remain
# notStarted with the r0a baseline owner until a later child claims them.

def phase2: {
  "codemirror-source-editor":      { childChange: "r1a-single-editor-surface", flag: "wysiwyg.singleEditorView.v1" },
  "core-backed-wysiwyg":           { childChange: "r0c-projection-correctness", flag: "wysiwyg.livePreview.v2" },
  "core-bridge-protocol":          { childChange: "r0b-parser-bridge-spike", flag: null },
  "core-diagram-render-targets":   { childChange: "r3c-frontmatter-diagram-html", flag: "widget.diagram" },
  "e2e-test-coverage":             { childChange: "r5a-desktop-visual-platform", flag: null },
  "editor-input-integrity":        { childChange: "r4a-input-integrity", flag: null },
  "frontmatter-core":              { childChange: "r3c-frontmatter-diagram-html", flag: "widget.frontmatter" },
  "gfm-table-core":                { childChange: "r3b-table-image-widgets", flag: "widget.table" },
  "image-storage-engine":          { childChange: "r3b-table-image-widgets", flag: "widget.image" },
  "keyboard-shortcuts":            { childChange: "r1b-command-history", flag: null },
  "markdown-semantic-projection":  { childChange: "r2a-render-ir-v2", flag: "wysiwyg.renderIr.v2" },
  "regression-coverage":           { childChange: "r5c-cleanup-archive", flag: null },
  "source-mode-core":              { childChange: "r1a-single-editor-surface", flag: null },
  "structured-block-editing":      { childChange: "r3a-task-code-widgets", flag: null },
  "typora-live-preview":           { childChange: "r2b-live-preview", flag: "wysiwyg.livePreview.v2" },
  "visual-release-gate":           { childChange: "r0a-baseline-governance", flag: "wysiwyg.livePreview.v2" }
};

.capabilities[] |= (
  if phase2[.id] then
    .owner = "@xian"
    | .childChange = phase2[.id].childChange
    | .flag = phase2[.id].flag
    | .default = (if .flag then false else .default end)
  else . end
)
