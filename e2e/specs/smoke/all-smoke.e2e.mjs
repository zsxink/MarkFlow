// ── Smoke test entry point ─────────────────────────────────────────
// WDIO 的 Tauri service 对每个 spec 文件启动一个独立的 Tauri 实例，
// 因此所有 smoke 测试合并到一个入口文件，各模块以函数导出、在单
// session 中串行执行，避免多实例资源竞争。
//
// 新增 smoke 测试步骤：在独立文件中导出 register*Tests 函数，
// 在此文件中导入并调用。

import { registerLaunchTests } from './app-launch.e2e.mjs';
import { registerFileOpenTests } from './file-open.e2e.mjs';
import { registerEditorModeTests } from './editor-mode.e2e.mjs';
import { registerEditSaveTests } from './edit-save-reload.e2e.mjs';
import { registerSettingsPanelTests } from './settings-panel.e2e.mjs';

registerLaunchTests();
registerFileOpenTests();
registerEditorModeTests();
registerEditSaveTests();
registerSettingsPanelTests();
