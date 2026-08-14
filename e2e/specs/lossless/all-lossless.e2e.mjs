// ── P1B lossless lifecycle test entry point ──────────────────────
// 与 p0s 相同：所有 lossless 测试合并到一个入口，各模块以 register*
// 函数导出，在单 Tauri session 中串行执行，避免多实例资源竞争。

import { registerLosslessLifecycleTests } from './lossless-lifecycle.e2e.mjs';

registerLosslessLifecycleTests();
