# Tasks

## 1. 隔离采集入口

- [x] 1.1 新增 `scripts/collect-dmg-appearance.mjs`：卸载非目标已挂载 DMG 卷（只清挂载点名含 `markflow-dmg-` 的）→ 挂载目标卷 → 复用 `collectAppearance` + `checkAppearance` 断言 → 立即 detach，失败时打印每条断言差异。验证：对一个已 style 的 DMG 以 0 退出，对 v0.1.0 原始产物列出 2 条失败（背景图缺失、backgroundType=0）。
- [x] 1.2 对已挂载干扰卷的场景做对照验证：挂载一个临时 DMG 卷后再运行采集入口，断言结果与干净环境一致。验证：两次运行输出一致且临时卷未被改动。

## 2. 一轮化回归脚本与证据

- [x] 2.1 新增 `scripts/regression-dmg-appearance.mjs`：串 style → 隔离 verify → 存证据（外观 JSON + 挂载卷 Finder 截图到 `evidence/`），截图失败降级为警告。验证：本机对构建产物运行，`evidence/` 生成两个文件且断言通过。
- [x] 2.2 `package.json` 增加 `regression:dmg` npm script。验证：`npm run regression:dmg -- <dmg>` 可运行。

## 3. 发布流水线切换

- [x] 3.1 `.github/workflows/release.yml` 的 Verify DMG appearance 步骤改用 `collect-dmg-appearance.mjs`，断言失败仍让 job 失败、release 保持 draft。验证：在本地用 `act` 不现实，至少静态核对 workflow YAML 语法（`node -e` YAML 无依赖解析或目测）并保留 `releaseDraft: true`。
- [x] 3.2 更新 `AGENTS.md`/`docs/` 或 openspec 说明文档，注明「发布产物必须晚于门禁合入」与回归入口的用法。验证：文档中能 grep 到 `regression:dmg` 用法。

## 4. 全链回归与归档

- [x] 4.1 本机完整走一轮 `build-dmg.mjs` → `regression-dmg-appearance.mjs`，确认证据 JSON 与截图齐全，且截图色块能对应到箭头与两图标区域。验证：`evidence/` 中新增文件的真实数值回读。
- [x] 4.2 跑 `npx openspec validate dmg-installer-alignment-reverify` 通过；`npm test`/`npx tsc --noEmit` 不回归（本变更不触碰 TS 源，应为 0 失败）。验证：命令退出码 0。
