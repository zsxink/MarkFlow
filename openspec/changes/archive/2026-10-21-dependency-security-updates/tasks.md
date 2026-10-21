# Tasks

## 1. Patch vulnerable production dependencies

- [x] 1.1 Upgrade DOMPurify, markdown-it, and Mermaid within compatible major versions; align Mermaid's KaTeX with the patched direct dependency and verify `npm ls dompurify markdown-it mermaid katex --all` contains no vulnerable versions
- [x] 1.2 Run `npm_config_registry=https://registry.npmjs.org npm audit --omit=dev --audit-level=high` and verify the production audit reports zero vulnerabilities

## 2. Verify compatibility and project gates

- [x] 2.1 Run `npm run build`, `npm test`, and `npx tsc --noEmit`; verify build succeeds and all tests pass
- [x] 2.2 Run `npm run validate:openspec`, `npm run check-size`, and `bash scripts/check-capabilities.sh`; verify each command exits successfully
