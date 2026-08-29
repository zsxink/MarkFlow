# P4A：Parser/Source Map Spike 与终态决定

## 0. 状态

> **TECHNICAL TERMINAL RECORDED：`SPIKE_COMPLETE_NO_CORE_IR`；PROGRAM ACCEPTANCE PENDING。** 候选比较、property tests、独立 Reviewer 与自动化全 gate 已完成，P4B/P6/P7 可以依赖该架构决定。Program Owner 的人工降级/性能确认必须在 P5 前完成。终态以 [parser/source-map ADR](../../adr/adr-parser-source-map-render-ir.md) 为准：CodeMirror Lezer 是本 change 唯一受信 local source-map，不引入 Core Render IR。

阶段名称与任务编号保留用于兼容历史证据；以下内容描述已冻结的产品终态，不再是待实现的 Core IR 方案。

## 1. 目标与结论

- 验证 parser/source-map 是否能精确提供 source/content/marker ranges；
- 淘汰不能满足 marker 粒度、鲁棒性或性能门禁的候选；
- 决定是否引入 Core Render IR；
- 为 P4B/P6/P7 冻结可依赖的 range 与 fallback 边界。

结论：Lezer local ranges 通过；Rust 候选没有同时满足 marker 粒度与门禁的 producer，因此 Core IR 的 schema、IPC、flag、dispatcher、stale/cancel E2E 均为 `NOT APPLICABLE`。复杂 construct 使用 local range + widget protocol；范围不可信时精确 source fallback。

## 2. 已完成证据

- 统一 fixtures 的 parser candidate comparison；
- CJK、emoji、escape、nested、malformed、Mixed EOL 与随机 boundary property tests；
- deep nesting/huge token/fuzz 鲁棒性；
- range 可回切 CodeMirror logical text；
- 独立 Reviewer 两轮复核；
- P4A terminal 全 gate 与证据索引，见 [P4A validation](../../validation/phases/P4A.md)。

## 3. 下游强制约束

- `local`、`widget`、`source-fallback` 是本 change 唯一运行时 owner；
- 不得新增 `coreRenderIr` flag、IR producer 或假定其存在的测试；
- FrontMatter 已知误判必须前置识别并在不可信时回退源码；
- footnote 等无可信结构节点的语法保持 source fallback；
- P7 table/image/diagram 必须分别证明 local ranges 足够，不能猜测性重写；
- 若未来满足 ADR 重议条件，必须新建 ADR/change，不得在本 program 中暗中恢复 Core IR。

## 4. 完成声明与回滚

P4A 只能表述为“parser/source-map spike 完成，决定不引入 Core IR”，不得称“Core IR 已实现”。运行时没有 Core IR 可回滚；投影失败的回滚单位是对应 local/widget construct，目标为精确 source fallback，同一 Core text/session/save 保持不变。
