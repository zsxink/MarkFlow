## Context

MarkFlow 是 Tauri v2 桌面 Markdown 编辑器。后端维护全局 `AppState.workspace_root`，前端通过 `cliFilePath` 判断是否为单文件模式。macOS 文件关联启动时，`setup` 阶段可能先恢复 `lastWorkspace`，随后 `RunEvent::Opened` 才到达，导致前后端状态不一致。`write_file` 命令在有工作区时调用 `validate_path_in_workspace()`，拦截了工作区外的文档保存。前端 `startAutoSave` 的 tick 未检查 `isDocumentDirty()`，导致干净文档也被周期性写入。

## Goals / Non-Goals

**Goals:**
- 用户通过文件关联、打开对话框、最近文件明确打开的文档，无论是否在工作区内，均可手动保存和自动保存
- 自动保存仅在文档有实际变更时触发写入
- 保存跳过（干净文档、保存进行中）不增加 `autosaveErrorCount`
- 文件树操作的工作区边界和符号链接校验完全保留

**Non-Goals:**
- 不重构 `AppState` 多窗口架构（后续可考虑按 window label 注册已授权路径）
- 不清理 `RunEvent::Opened` 冷启动残留状态（方案 A 已从根本上解决保存权限问题）
- 不改变其他命令（`create_file`、`rename_path` 等）的权限模型

## Decisions

### 1. 移除 `write_file` 的工作区检查

**选择：** 从 `write_file` 中移除 `validate_path_in_workspace()` 调用。

**替代方案：**
- 保持检查但维护"已授权文档路径"白名单 — 过于复杂，当前不需要
- 仅对单文件模式跳过检查 — 无法处理多窗口场景

**理由：** `write_file` 是文档保存命令，应遵循 `resolve_path` 注释中的产品模型：用户明确打开的文件允许保存。工作区边界是文件树操作的安全边界，不是文档保存边界。`atomic_write` 和路径规范化已提供足够的安全保障。

### 2. 自动保存增加 dirty guard

**选择：** 在 `startAutoSave` 的 tick 回调最前面增加 `isDocumentDirty()` 检查。

**理由：** 最小侵入性修改，直接解决问题。`isDocumentDirty()` 已存在于 `editor.state.ts`，被 10 处调用，是成熟的 API。

### 3. 区分保存结果语义

**选择：** 将 `saveActiveDocument` 的返回值从布尔改为联合类型 `'saved' | 'skipped' | 'failed'`，`startAutoSave` 仅在 `'failed'` 时增加错误计数。

**替代方案：** 仅在前端用布尔值 + 外部 dirty 检查 — 语义不够精确。

**理由：** 显式区分保存成功、主动跳过和实际失败，让调用方做出正确的错误计数决策。

## Risks / Trade-offs

- **[风险] 移除工作区检查可能降低安全性** → `resolve_path` 的路径规范化和 `atomic_write` 的原子写入已提供保护。符号链接防护仍由文件树命令保留。文档保存场景下，用户明确打开了文件，这是预期行为。
- **[风险] `saveActiveDocument` 返回值类型变更影响其他调用方** → 需要检查所有调用点。布尔返回值的旧调用方使用 truthy 检查，联合类型的 `'saved'` truthy、`'skipped'` 和 `'failed'` 也是 truthy，需要逐一审查。最小改动：前端先只改 `startAutoSave` 的判断逻辑，其他调用方保持兼容。
