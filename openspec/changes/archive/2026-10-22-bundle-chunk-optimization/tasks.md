# Tasks

- [x] 1. Capture the baseline initial/dynamic chunk graph and minified/gzip sizes; identify the composition of the 725 kB entry chunk.
- [x] 2. Trace editor source-mode and PlantUML production imports; implement only safe feature-boundary dynamic imports and preserve runtime behavior.
- [x] 3. Review Mermaid and manual chunk boundaries; adjust configuration only where it reduces ordinary startup loading or feature cost.
- [x] 4. Build and compare chunk outputs, update bundle-size reporting if needed, and document unavoidable warnings with rationale.
- [x] 5. Validate the production build and import graph for affected feature boundaries; update this task list with completed work.
- [x] 6. Set an explicit warning limit above the current required vendor chunks while retaining a guard for chunks above 720 kB.
- [x] 7. Remove redundant dynamic-import warnings for CodeMirror's statically linked languages and the degradation-bar editor import; rebuild without Vite warnings.
