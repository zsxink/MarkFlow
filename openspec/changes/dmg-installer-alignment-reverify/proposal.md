# Proposal

## Why

Issue #293 报告正式发布产物 `v0.1.0` 的 DMG 安装窗口中，MarkFlow 应用图标与 Applications 文件夹和背景图的引导元素错位。实测该产物确认：卷内**背景图完全缺失**、`backgroundType=0`（窗口是纯色背景）、`textSize=16` 超出契约——原因是产物出自 tag `9eab434`（v0.1.0，09-21 16:12），而外观修复与门禁（`998310e`/`a38ead2`，09-21 18:29-18:42）在发布**之后**才合入。当前 HEAD 的链路经本机构建 + Finder 截图像素分析验证已对齐（箭头与两图标中心同高 ≈170），但存在两个必须补上的薄弱环节：(1) 跨窗口状态泄漏——macOS 会把上一次打开的 DMG 窗口的视图设置套到下一个 DMG 窗口，破坏 verify 断言的确定性；(2) 无「从成品产物角度一轮完整走 build → style → verify → 存档证据」的回归验证步骤，导致 v0.1.0 那类「修复晚于发布」无人察觉。

## What Changes

- 新增 `scripts/collect-dmg-appearance.mjs`：隔离状态下采集 DMG 外观事实的独立入口（对照脚本 + 卸载全部已挂载卷 → 挂载目标卷 → 独立进程采集 → 立即卸载），消除 Finder「上一个 DMG 窗口的状态污染」对采集结果的影响。
- 发布流水线 DMG 外观断言从「in-process 采集」切换为「隔离子进程采集」，同一套 `checkAppearance` 断言逻辑不变。
- 新增 `scripts/regression-dmg-appearance.mjs` 一轮化回归脚本：对给定产物依次执行 style（等长字节归一化）→ verify（契约断言）→ 存档证据（外观事实 JSON + 挂载卷 Finder 截图到 `evidence/`），并对证据做最小断言（事实合规 + 截图尺寸大于 0）。
- 文档固基线：在 `openspec` 设计文档记录「v0.1.0 早于门禁」的根因与本轮实测数据（箭头 y=170.5、两图标 content y≈170、背景图 1×@72dpi），作为后续版本的对照锚点。

## Capabilities

### New Capabilities
（无）

### Modified Capabilities

- `dmg-installer-appearance`: 外观事实采集 SHALL 在隔离状态下进行（先清除已挂载的 DMG 卷、逐项对照检查、再挂载目标卷、独立进程采集），且 SHALL 提供一轮化回归脚本（style → verify → 存档外观 JSON + Finder 截图证据），堵住跨窗口状态泄漏与「修复未进入发布产物」两类偏差。

## Impact

- 受影响代码：`scripts/style-dmg.mjs`、`scripts/verify-dmg-appearance.mjs`（ ved 现有采集路径）、新增 `scripts/collect-dmg-appearance.mjs` 与 `scripts/regression-dmg-appearance.mjs`、`.github/workflows/release.yml`（ verify 步骤换用隔离采集）、`package.json`（新增 `verify:dmg`入参不变但内部换路径；新增 `regression:dmg`）。
- 需要重新产出发布产物：v0.1.0 的 DMG 需要随下一次发布（或 hotfix tag）重新构建，才能让用户下载到已修复的安装包；建议在 release notes 中提示重新下载。
- 不改动 `tauri.conf.json` 的坐标/窗口尺寸/背景图内容。

