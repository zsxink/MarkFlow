# R4B：Performance、Security 与 Resilience

## 目标

达到可复现的大文档性能预算、安全门禁和显式 degradation 要求。

## 范围

- OpenSpec tasks：`10.1-10.8`。
- 主要区域：benchmark、viewport projection、async widgets、安全回归、telemetry。

## 实现

1. 用 1/10/50 MiB fixtures 采集 input、ack、projection、scroll、switch、save、memory。
2. 按 A7 manifest 固定 hardware/software、profile、warm-up、样本、分位数和噪声策略。
3. `>1 MiB` viewport-only projection 和 bounded overscan。
4. heavy widgets lazy；Huge 文档采用 policy-controlled degradation。
5. 为 async widget 预留稳定尺寸并验证 cancellation。
6. 增加 raw HTML、SVG event、unsafe URL、path traversal、symlink、payload、timeout regressions。
7. telemetry 只记录时延、计数、error code、identity，不记录文档内容。

## 验收

- local commit p95 `<=16 ms`。
- normal projection p95 `<=50 ms`，large p95 `<=100 ms`。
- mode reconfigure p95 `<=50 ms`。
- Huge 文档仍可进入两模式、编辑、滚动、保存。
- security suite 无高危缺口，日志无内容或 secret。
- 人工执行 `M-R4-07` 至 `M-R4-09`。

## 回滚

超预算功能按 size class 禁用并显示 degradation；安全失败默认关闭对应 preview/Host capability。

## 前后依赖

- 前置：[R0A](./r0a-baseline-governance.md)、[R3C](./r3c-frontmatter-diagram-html.md)
- 后续：[R5A](./r5a-desktop-visual-platform.md)

