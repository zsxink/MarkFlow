# Spec 碎片化审查评估

> 审查日期：2026-07-29
> 审查范围：openspec/specs/ 下 Core 重构相关 spec 与 docs/markflow-core-stages/ 的 overlap

## Legacy Specs 状态

- `openspec/specs/architecture.md` — 已标注 Legacy notice，指向 `docs/markflow-core-stages/technical-plan.md`。状态正确，保留为历史参考。
- `openspec/specs/technical-design.md` — 已标注 Legacy notice + Current Core note。状态正确，保留为历史参考。

**结论**：无需额外操作，legacy 标记已足够。

## Core 相关 Spec 清单

存在 10+ Core 重构相关 spec，数量偏多但各有明确边界：

| Spec | 边界 | 与 stage docs 的关系 |
|------|------|----------------------|
| `core-backed-source-mode` | Source Mode Core-backed 行为、patch 同步、flush | 对应 `docs/.../m3-core-backed-source-mode.md`（更详细） |
| `core-bridge-protocol` | IPC DTO 与 error code 映射 | 无直接对应，桥接协议独立 |
| `core-restructure` | ParseIndex 模块拆分、类型定义 | 对应 M2 范围 |
| `runtime-document-service` | Runtime session/save 编排 | 对应 M3.1 部分内容 |
| `source-lifecycle-guard` | Source Mode 生命周期守卫 | 对应 M3.1 部分内容 |
| `source-patch-adapter` | CM transaction → UTF-16 patch | 对应 M3 Phase 4 |
| `source-sync-controller` | 前端 patch 状态机 | 对应 M3 Phase 4 |
| `save-integrity` | 保存完整性和原子写入 | 对应 M3.1 部分内容 |
| `markflow-runtime` | Runtime crate 架构 | 无直接 stage doc overlap |
| `markflow-core-foundation` | Core session、patch、snapshot 基础 | 对应 M1 范围 |

**结论**：
1. 各 spec 边界清晰，不存在严重的重复定义
2. stage docs 是更详细的设计文档，specs 是精简的需求定义——互补关系
3. 少量 overlap（如 save-integrity vs runtime-document-service）属于同一能力的不同视角，无实际冲突
4. **不建议在本次 change 中合并 spec**，作为独立后续任务处理更合理

## 建议操作

短期（本次 change 后）：
- 保持现状，各 spec 继续有效

长期（单独 change）：
- 将 `source-lifecycle-guard` / `source-patch-adapter` / `source-sync-controller` 合并为一个 `source-mode-core` spec
- 将 `runtime-document-service` / `save-integrity` 合并到 `markflow-runtime` spec
- 确认 `core-bridge-protocol` 是否需要独立存在，或并入 `core-backed-source-mode`
