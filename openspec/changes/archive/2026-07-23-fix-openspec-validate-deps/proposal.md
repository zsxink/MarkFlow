## Why

GitHub Actions CI runs `npx openspec validate --all` but the repo has no `@fission-ai/openspec` in devDependencies. `npx` resolves to a non-existent `openspec` executable, causing CI to fail with `npm error could not determine executable to run`. This blocks all PR merges.

## What Changes

- Add `@fission-ai/openspec` as a devDependency in `package.json`
- Add a `validate:openspec` npm script for unified local/CI execution
- Update `.github/workflows/ci.yml` to use `npm run validate:openspec` instead of `npx openspec validate --all`
- Update CLAUDE.md to document the new script

## Capabilities

### New Capabilities

_No new capabilities — this is a CI infrastructure fix, not a feature change._

### Modified Capabilities

_No spec-level behavior changes._

## Impact

- **Dependencies**: `@fission-ai/openspec` added to devDependencies
- **CI**: `.github/workflows/ci.yml` step "Validate OpenSpec specs" uses npm script
- **package.json**: New `validate:openspec` script
- **CLAUDE.md**: Updated build/test section to document the script
