# Tasks

## 1. Audit and remove unused TypeScript symbols

- [x] 1.1 Recheck all A-E symbols against current production references with repository search and CodeGraph callers; record any live-use exception and retain that symbol if found
- [x] 1.2 Remove verified empty context-menu hide exports and the corresponding table-menu test mock key; verify affected tests and TypeScript build pass
- [x] 1.3 Remove verified complexity stub, compatibility aliases, unused types/constants, and isolated helpers; verify no remaining production references and run `npx tsc --noEmit`

## 2. Remove verified Rust dead code

- [x] 2.1 Recheck the two error constructors and logger statement for current use, then remove only the dead items and the stale `dead_code` attribute; verify `cd src-tauri && cargo clippy --all-targets -- -D warnings` passes
- [x] 2.2 Run `cd src-tauri && cargo test` and confirm Rust tests pass

## 3. Remove unused dependencies and stale build configuration

- [x] 3.1 Recheck direct source imports, then remove `@tauri-apps/plugin-fs` from npm and Cargo manifests, remove its Tauri plugin registration, and regenerate lockfiles; verify `npm ls @tauri-apps/plugin-fs highlight.js` and `bash scripts/check-capabilities.sh`
- [x] 3.2 Remove root direct `highlight.js` dependency while retaining lowlight's transitive dependency; remove only the listed transitive-only `manualChunks` entries and verify `npm run build` and inspect `dist/` for plugin-fs chunks
- [x] 3.3 Upgrade the local OpenSpec CLI to a version that honors `skip_specs: true`; verify `npm run validate:openspec` accepts this behavior-only change

## 4. Remove unused assets and generated files

- [x] 4.1 Recheck references, remove the two listed full-size Source Han Serif fonts and `.large-parse.mjs`, and verify `npm run build` succeeds with expected output-size reduction
- [x] 4.2 Untrack `docs/bundle-report.html` while retaining its local copy, add it to `.gitignore`, and verify it is ignored and remains regenerable through `npm run analyze`

## 5. Full integration verification

- [x] 5.1 Run `npx tsc --noEmit`, `npm run build`, `npm test`, and `npm run validate:openspec`; confirm all pass and test totals are consistent with the current suite
- [x] 5.2 Review the final diff against `origin/main` to confirm only enumerated issue scope changed and all explicitly excluded items remain untouched
