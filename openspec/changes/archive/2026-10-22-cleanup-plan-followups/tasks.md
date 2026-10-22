# Tasks

## 1. Consolidate diagram context-menu behavior

- [x] 1.1 Extract the shared Mermaid/PlantUML menu actions and SVG-to-PNG flow while retaining the two typed public adapters and diagram-specific save callbacks; add focused tests proving each adapter uses its own save callbacks and existing menu behavior.
- [x] 1.2 Consolidate the identical menu-positioning and PNG-canvas validation helpers into one module, update all imports, remove the duplicate helper, and add or update tests for valid, invalid, dimension-limit, and pixel-limit inputs.

## 2. Integration verification

- [x] 2.1 Run `npx tsc --noEmit`, `npm test`, `npm run build`, and `npm run validate:openspec`; resolve any regressions and confirm the Mermaid and PlantUML requirements remain unchanged.
