// ── P2/P1B Program Owner acceptance entry point ──────────────────────
// Runs the acceptance spec in a single Tauri session. The fixture files
// (constructs / switch / zeroedit) are written by run-lossless-acceptance.mjs.

import { registerP2AcceptanceTests } from './p2-acceptance.e2e.mjs';

registerP2AcceptanceTests();