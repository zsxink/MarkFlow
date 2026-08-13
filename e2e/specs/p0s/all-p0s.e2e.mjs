// ── P0S dedicated lifecycle test entry point ──────────────────────
// 与 smoke 相同：所有 p0s 测试合并到一个入口，各模块以 register*
// 函数导出，在单 Tauri session 中串行执行，避免多实例资源竞争。

import { registerP0SLifecycleTests } from './p0s-lifecycle.e2e.mjs';

registerP0SLifecycleTests();
