## 1. Frontmatter domain and preservation layer

- [x] 1.1 Add `yaml` v2 as a direct dependency and record a safe-subset extension spike for comment-free homogeneous flow/block scalar arrays; verify the report covers Unicode offsets, LF/CRLF, quoting, add/remove/reorder, mixed/nested/null/comment rejection, and gates array controls on passing evidence.
- [x] 1.2 Implement BOM/EOL-aware extraction of a complete leading frontmatter block and its body boundary; verify unit tests cover absent, unclosed, LF, CRLF, and BOM-delimited documents.
- [x] 1.3 Implement the YAML 1.2 Core classifier and typed field model with unique non-empty string keys, no merge keys, deterministic scalar/date inference, and the evidence-gated simple-array rules; verify boundary tests cover quoted type-like strings, valid/invalid dates, finite canonical decimal numbers, unsupported keys, and all fallback reasons.
- [x] 1.4 Implement lossless field-local YAML patch operations for edit, add, remove, and reorder; verify fixtures preserve unrelated comments, quotes, blank lines, delimiters, sequence presentation style, and unsupported source text, and that a failed patch leaves the input unchanged.

## 2. Editor synchronization and source-mode highlighting

- [x] 2.1 Integrate frontmatter extraction with WYSIWYG admission/reconciliation so the body remains separate from frontmatter and accepted panel edits rebuild a valid canonical Markdown/admission baseline; verify existing opaque-frontmatter and save-reconciliation tests plus new integration cases pass.
- [x] 2.2 Configure CodeMirror to highlight only a document-leading complete frontmatter region as YAML while preserving Markdown highlighting for the body; verify tests or DOM assertions distinguish YAML key/value/comment tokens and Markdown body tokens.
- [x] 2.3 Add a reentrancy-guarded frontmatter synchronization controller that derives panel state from canonical Markdown and routes panel changes through the existing document update path; verify panel-to-source, source-to-panel, document-reload, and mode-switch synchronization each update once without false dirty state.
- [x] 2.4 Subscribe the frontmatter controller and raw editor to runtime document read-only changes; verify mutation controls disable immediately and read-only transitions do not change Markdown, revision, or dirty state.

## 3. Frontmatter editing interface

- [x] 3.1 Build the top-of-editor frontmatter region with clear metadata/body separation, collapse state, YAML source presentation, and source-fallback explanation; verify documents with and without complete frontmatter render the correct state.
- [x] 3.2 Build type-aware field controls for supported scalar values and simple arrays, including validation feedback and add/remove fields; verify component tests preserve intended scalar type and update the YAML source immediately.
- [x] 3.3 Add field ordering by pointer drag-and-drop plus keyboard-accessible reorder controls and ARIA feedback; verify reordered fields serialize in the requested order and are operable without a pointer.
- [x] 3.4 Implement unsupported-YAML fallback UI that disables destructive structured actions but preserves editable raw YAML; verify nested and invalid YAML remain editable, and changing them into the safe subset enables the field editor.
- [x] 3.5 Add "新增 Frontmatter" to the top MarkFlow menu for active editable documents with no complete frontmatter; verify it is disabled for no document, read-only documents, and documents with frontmatter, and that creation preserves BOM/EOL, marks the document dirty, opens the region, and focuses new-field input.

## 4. Quality gates

- [x] 4.1 Add regression fixtures and unit/integration coverage for safe subset parsing, preservation, two-way synchronization, complex fallback, read-only behavior, menu creation, and source-mode YAML highlighting; verify `npm test` passes.
- [x] 4.2 Validate types, build output, and OpenSpec artifacts; verify `npx tsc --noEmit`, `npm run build`, and `npx openspec validate frontmatter-visual-editor --strict` pass.
