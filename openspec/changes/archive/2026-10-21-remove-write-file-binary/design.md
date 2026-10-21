# Design

## Context

参见 proposal.md — Why。当前状态要点：

- `write_file_binary` 位于 `src-tauri/src/commands/export.rs`，函数体仅一行 `std::fs::write`，无任何路径解析、工作区校验、大小限制或对话框授权。
- 它已在 `src-tauri/src/lib.rs` 的 `generate_handler!` 中注册，因此对前端 IPC 可见。
- 实际 DOCX 导出走 `save_binary_export`（同文件，弹窗 + 写盘 + 取消返回 `false`），PDF 走 `create_pdf`，图片导出走 `files::save_image_export`，均有对话框或工作区约束。
- `write_file_binary` 无任何调用方（`src/`、`src-tauri/`、测试均无引用；仅历史归档文档提及）。

## Goals / Non-Goals

**Goals:**

- 彻底移除该 IPC 攻击面，同时不改变任何现有导出行为。
- 在规范中固化「导出写盘必须授权」的约束，防止该模式被重新引入。

**Non-Goals:**

- 不重构 `save_binary_export` / `create_pdf` 等现有导出命令。
- 不为导出命令引入工作区校验（导出按设计允许写到工作区外，见 `export-workspace-bypass`）。
- 不修改 `docs/cleanup-plan/` 下的历史分析文档。

## Decisions

### 决策 1：直接删除而非加固

选择删除 `write_file_binary`，而不是给它补 `resolve_path` + `validate_path_in_workspace` + 大小上限 + 保存对话框。

理由：该函数零调用方，加固需要额外的对话框参数（当前签名没有 `AppHandle`），并且会与 `save_binary_export` 功能重复。删除是零回归风险的最小改动。

备选方案：保留为内部 Rust 函数（去掉 `#[tauri::command]`）。否决原因 —— 仍无调用方，留死代码反而增加维护负担；proposal 已记录「将来有刚需时再以内部函数实现」。

### 决策 2：用 ADDED delta 固化约束，而非修改既有 Requirement

在 `export-workspace-bypass` 中新增一条 Requirement「必须经过授权」，而非修改现有「Export writes bypass workspace validation」。

理由：现有 requirement 描述的是导出可以绕过工作区校验（能力），新增 requirement 描述的是不得存在无授权写盘通道（安全边界），两者语义正交，ADDED 不会丢失原文细节。

### 决策 3：不做前端兼容层

该 command 从未被前端调用（`src/` 全量搜索无 `write_file_binary`）。因此直接移除 `generate_handler!` 条目，无需 deprecation 周期。

## Risks / Trade-offs

- [存在未搜索到的外部调用方（如第三方插件）] → 全仓库 grep 已覆盖 `src/`、`src-tauri/`、`docs/`、`openspec/`；这是应用私有 IPC，无公开 API 承诺。移除后 `cargo check` 与 `npm run build` 会暴露任何残留引用。
- [删除后导出回归] → 导出路径未改变，`save_binary_export` 保持原样；验收清单包含 DOCX/PDF/图片导出回归检查。
- [规范新增 requirement 与现有 requirement 表述重叠] → 新 requirement 明确聚焦「不得有零校验写盘 command」，并在 scenario 中直接引用具体反例，archive 后可与既有 requirement 并存。
