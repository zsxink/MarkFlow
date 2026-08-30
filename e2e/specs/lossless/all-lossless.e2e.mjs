// ── P1B/P2 lossless test entry point ─────────────────────────────────
// 与 p0s 相同：所有 lossless 测试合并到一个入口，各模块以 register*
// 函数导出，在单 Tauri session 中串行执行，避免多实例资源竞争。

import { registerLosslessLifecycleTests } from './lossless-lifecycle.e2e.mjs';
import { registerLivePreviewTests } from './live-preview.e2e.mjs';
import { registerP4bCohortRevealTests } from './p4b-cohort-reveal.e2e.mjs';
import { registerP4bWidgetTests } from './p4b-widgets.e2e.mjs';

registerLosslessLifecycleTests();
registerLivePreviewTests();
// P4B task 7.1/7.2 per-cohort reveal — PENDING-MANUAL/ENV (see the file header):
// requires a real Tauri e2e build + operator confirmation; unit equivalents are
// locked headlessly in projection.test.ts.
registerP4bCohortRevealTests();
registerP4bWidgetTests();
