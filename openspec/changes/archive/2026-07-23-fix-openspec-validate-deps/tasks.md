# Tasks

- [x] 1. Install `@fission-ai/openspec` as devDependency
  - Run `npm install --save-dev @fission-ai/openspec`
  - Verify it appears in `package.json` devDependencies

- [x] 2. Add `validate:openspec` script to `package.json`
  - Add `"validate:openspec": "openspec validate --all"` to scripts

- [x] 3. Update CI workflow
  - In `.github/workflows/ci.yml`, change step "Validate OpenSpec specs" from `npx openspec validate --all` to `npm run validate:openspec`

- [x] 4. Update CLAUDE.md documentation
  - Add `npm run validate:openspec` to the build/test section

- [x] 5. Fix 6 pre-existing spec format issues
  - Added `# title` and `## Purpose` sections to 5 specs
  - Converted `## ADDED/MODIFIED Requirements` → `## Requirements` in delta specs
  - Removed leftover `## REMOVED Requirements` sections
  - Added SHALL keyword to source-toolbar-cm6 requirement

- [x] 6. Verify locally
  - `npm run validate:openspec` passes: 51/51
