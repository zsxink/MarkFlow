# R5A：Desktop、Visual 与 Platform Gates

## 目标

在真实 Tauri WebView 和目标平台收集 current-revision required release evidence。

## 范围

- OpenSpec tasks：`11.1-11.10`。
- 主要区域：E2E page objects/specs、visual baselines、CI artifacts、platform runbooks。

## 实现

1. page object 只定位 active Core Source/WYSIWYG surface。
2. canonical semantic E2E 覆盖所有 P0/P1 block、inline 和 widgets。
3. 覆盖 commands、History、mode switch、save bytes、degraded、A/B 和 window lifecycle。
4. frontend/backend error、panic、stale routing 使 suite 失败。
5. 固定 light/dark、active/inactive/composing/selected/widget/source/degraded baselines。
6. baseline manifest 固定 OS、WebView、font、theme、scale、viewport、animation、tolerance 和 mask。
7. 在 macOS、Windows、Linux 执行 platform runbook，保留 logs/screenshots/video。

## 验收

- Desktop E2E、visual diff、三平台 smoke 全通过。
- macOS/Windows IME 证据完整；Linux keyboard/widget/save/export 完整。
- baseline 更新有 reviewer 和理由，mask 不隐藏功能区域。
- 人工执行 `M-R5-01` 至 `M-R5-04`。

## 回滚

任一 required platform 失败则不发布；可关闭单项 projection flag，但必须重新执行受影响证据。

## 前后依赖

- 前置：[R4A](./r4a-input-integrity.md)、[R4B](./r4b-performance-security.md)
- 后续：[R5B](./r5b-stability-observation.md)

