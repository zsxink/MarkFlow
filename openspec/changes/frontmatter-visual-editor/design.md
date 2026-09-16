## Context

Frontmatter at byte zero is currently admitted as an opaque Markdown span: this protects its raw bytes during WYSIWYG admission and reconciliation, but makes it unavailable to a structured editor. CodeMirror already ships with the YAML language package, while WYSIWYG/source mode maintains a single persisted Markdown truth through its reconciliation and eligibility boundary. The M0 spike established that arbitrary YAML cannot safely be rewritten; only top-level scalar mappings are a proven structured-edit boundary. This change retains that baseline and requires separate fixture evidence before enabling the narrowly defined simple-array extension.

## Goals / Non-Goals

**Goals:**

- Make complete leading frontmatter discoverable and editable above the document body without treating it as prose.
- Offer fast, bidirectional structured editing for the proven scalar subset and an evidence-gated simple-array extension while retaining lossless source preservation.
- Keep the existing source-only fallback and WYSIWYG/save reconciliation guarantees intact.

**Non-Goals:**

- Supporting nested YAML objects/sequences, anchors, aliases, tags, duplicate keys, or arbitrary YAML formatting rewrites in the form.
- Changing Markdown's on-disk document format, its frontmatter delimiters, or the ownership of document persistence.
- Introducing an alternative full YAML IDE; direct YAML remains the escape hatch.

## Decisions

### Treat frontmatter as a dedicated view layered on the existing Markdown truth

Extract only a complete leading delimiter-bounded frontmatter slice for rendering a top-of-editor metadata region; keep the original complete Markdown as the authoritative document value. The body view receives the existing opaque/sentinel representation so frontmatter cannot accidentally become a ProseMirror body node. This reuses existing admission and reconciliation safety instead of teaching the Markdown serializer to round-trip arbitrary YAML.

Alternative: model YAML as an editable ProseMirror node. Rejected because ProseMirror mutations would not preserve comments, quoting, blank lines, and unsupported YAML faithfully.

### Separate safe-subset analysis from lossless patching

Add a pure frontmatter module that (1) finds a leading block with BOM and LF/CRLF awareness, (2) parses/classifies it, and (3) produces lossless field-local patches. Use `yaml` v2 as a direct dependency in YAML 1.2 Core mode with source tokens retained for analysis and ranges; never persist by stringifying the parsed document. Eligibility requires a top-level mapping with unique, non-empty scalar string keys, no `<<` merge key, and supported values only. Unsupported syntax returns an explicit reason and raw text, never a partially parsed editable model. Patch operations must target source ranges and preserve every unrelated raw fragment; failure returns a non-mutating result.

Scalar classification is deliberately narrower than the complete YAML schema:

- Quoted scalars are always text. Plain `true`/`false`, `null`/`~`, finite canonical base-10 integers or decimals, and valid `YYYY-MM-DD` calendar dates map to boolean, null, number, and date controls; all other plain scalar strings map to text.
- Typed edits emit canonical lowercase booleans, `null`, finite base-10 numbers, and zero-padded ISO dates. Text is quoted whenever plain emission could change its type or YAML structure.
- A simple array is empty or contains comment-free, homogeneous scalar items of one supported non-null type. Both flow and block sequences are accepted; edits preserve the existing sequence style. Nested/mixed arrays, null items, and arrays with internal comments fall back to raw source.

Because M0 did not validate array rewrites, implementation begins with a fixture spike covering flow/block arrays, Unicode offsets, EOLs, quoting, add/remove/reorder, and rejection cases. Structured array controls remain disabled until this evidence passes and is recorded with the change.

Alternative: parse with a YAML library then serialize the whole mapping after every form edit. Rejected because normal serializers erase source-level properties the M0 spike requires preserving.

Alternative: infer types using YAML 1.1 or locale-specific date parsing. Rejected because values such as `yes`, `on`, and ambiguous dates would change meaning across tools or locales.

### Establish one reentrancy-guarded synchronization controller

The frontmatter component owns an ephemeral view model derived from the active Markdown value. Form actions request a lossless patch, then update the same Markdown authority used by source/WYSIWYG synchronization. Direct YAML changes and external document replacements re-derive the view model. Origin tokens or a transaction guard prevent a local panel-to-source update from being read back as a second user edit; semantic equality avoids redundant updates and false dirty transitions.

Alternative: maintain a separate mutable YAML store. Rejected because it creates competing document truths and makes mode switching and external updates race-prone.

### Use native CodeMirror YAML support for source mode and a scoped presentation for WYSIWYG

Configure a mixed language view so a document-leading frontmatter region receives the existing YAML language parser and the following content stays Markdown. The WYSIWYG metadata region uses a source-backed editor/presentation with token classes themed alongside CodeMirror, keeping terminology and color meaning consistent without duplicating parsing logic.

Alternative: regex-based highlighting. Rejected because it becomes inconsistent for strings, comments, arrays, and malformed input.

### Define explicit UI state and access behavior

The top region has: absent, supported/expanded, supported/collapsed, and source-fallback states. Absent renders no placeholder. The existing top MarkFlow dropdown menu gains an "新增 Frontmatter" action that is enabled only for an active, editable document without a complete leading block. It inserts an empty block after any BOM, uses the established document EOL (LF by default), keeps a blank separator before a non-empty body, then opens the panel at the new-field control.

The field list uses keyboard-accessible add/remove controls; drag ordering must also have a non-pointer accessible reorder mechanism. Source fallback states state why forms are unavailable and leave direct YAML focus/editing available. When `readOnly` is true, the region remains inspectable but its raw editor, form controls, and reorder actions are disabled; the menu creation action is also disabled. A runtime read-only transition updates these controls without reconstructing or changing the document.

## Risks / Trade-offs

- [Lossless YAML patching is narrower than semantic YAML parsing] → Classify conservatively, use source spans, and refuse the form edit when a stable patch cannot be generated.
- [Existing opaque registry assumes frontmatter is immutable in WYSIWYG] → Route each accepted frontmatter patch through the normal content replacement/admission flow and rebuild baselines atomically.
- [Two editing surfaces can loop or show stale values] → Derive all UI state from the canonical Markdown snapshot and label every write with an origin token.
- [Mixed-language parsing may affect large documents] → Restrict YAML parsing to the bounded leading frontmatter slice; retain current document-size degradation policies for the Markdown body.
- [Drag-only ordering excludes keyboard users] → Provide focusable move controls/shortcuts and ARIA live feedback in addition to pointer drag-and-drop.
- [The YAML package AST is semantic rather than a fully lossless editor model] → Retain original text and source tokens, apply only validated ranges, and treat any unstable range or unsupported construct as source-only.

## Migration Plan

1. Record the extended safe-subset fixture spike, then add the pure extraction, eligibility, and source-patch layer.
2. Add CodeMirror mixed YAML/Markdown highlighting and verify existing source-mode synchronization tests remain valid.
3. Mount the WYSIWYG metadata region behind the existing editor lifecycle, integrate form actions through the canonical content update path, and bind read-only state.
4. Add the top-menu creation command for frontmatter-absent editable documents.
5. Enable visual editing only after lossless patch and reconciliation tests pass; documents outside the safe subset automatically use source fallback.
6. Rollback consists of disabling the metadata view/controller and menu command; documents stay valid Markdown because no persisted format migration is introduced.
