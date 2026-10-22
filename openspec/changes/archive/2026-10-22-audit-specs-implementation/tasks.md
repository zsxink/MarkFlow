# Tasks

## 1. Establish audit evidence and inventory

- [x] 1.1 Inventory all `openspec/specs/` documents, assign document-level dispositions, and identify requirement-level scope still awaiting review; record evidence paths and limitations in `audit.md`.
- [x] 1.2 Inspect CI workflows and package scripts that validate OpenSpec; record the actual command and scope in `audit.md` and compare with `openspec/specs/INDEX.md`.

## 2. Verify reported edge cases and calibrate documentation

- [x] 2.1 Trace `empty-line-preservation` claims through source, serializer tests, and related specs; record evidence and unresolved intent in `audit.md`, then correct only demonstrated wording conflicts in the canonical spec.
- [x] 2.2 Trace `trailing-newlines-preservation` dirty and save behavior across Source and WYSIWYG modes using implementation and tests; record evidence and unresolved intent in `audit.md`, then correct only demonstrated overbroad wording.
- [x] 2.3 Compare the validation guidance in `openspec/specs/INDEX.md` with CI and `package.json`; update the documented command/scope to match the actual CI invocation and cite it in `audit.md`.

## 3. Validate audit outputs

- [x] 3.1 Review `audit.md` to ensure every disposition has a spec reference and its stated evidence/rationale; distinguish checked CI invocations and corrected claims from unresolved requirements that still need claim-by-claim implementation/test review, and confirm no product implementation files were changed.
- [x] 3.2 Run `npm run validate:openspec` and the targeted tests for changed behavioral-spec wording; record successful commands and results in `audit.md`.
