# Tasks

## 1. Automatic mode selection and manual WYSIWYG switching

- [ ] 1.1 Separate size-based default mode selection from content qualification so exceeding only the WYSIWYG threshold does not reject a manual switch; verify focused tier and mode-switch tests cover both under-threshold and over-threshold cases.
- [ ] 1.2 Remove node-count and block-complexity gates from WYSIWYG loading; retain Markdown safety checks and verify large valid documents can be manually switched to WYSIWYG.
- [ ] 1.3 Keep per-tab mode and dismissal state isolated and update the degradation notice on activation, mode switch, and dismissal; verify tab-switch tests cover independent notice state.

## 2. Settings and backend contract

- [ ] 2.1 Verify WYSIWYG bytes, source bytes, and max-lines remain synchronized across TypeScript/Rust settings serialization; add or update read-modify-write tests and confirm old node/text-length fields are ignored and stripped.
- [ ] 2.2 Verify threshold edits affect newly opened documents without changing already-open tabs; cover KB/MB conversion, defaults, invalid values, source-size confirmation/override, and the source-size ≥ WYSIWYG-size constraint.

## 3. Window and notice projection

- [ ] 3.1 Project active filename and dirty `*` into the native window title on tab activation, edit, save, and last-tab close; verify title state in focused UI tests.
- [ ] 3.2 Implement the compact themed notice below the tab bar with switch action, X dismiss, and whole-notice hover guidance; verify text, placement, dismissal, and switch behavior in UI tests.

## 4. Prototype and documentation

- [ ] 4.1 Update `openspec/ui-design/原型.html` and its icon asset to reflect the overall application prototype, settings pages while preserving the current full-width toolbar and sidebar placement, title dirty marker, and large-document notice; verify linked assets and local HTML structure.
- [ ] 4.2 Update `openspec/ui-design/SPEC.md` and the capability delta specs to match the shipped UI and backend behavior; verify `npx openspec validate issue-405-settings-and-large-document-mode --strict` succeeds.
