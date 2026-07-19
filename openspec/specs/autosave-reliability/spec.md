# autosave-reliability Specification

## Purpose
确保自动保存失败时用户能持续获知状态且文档保持未保存标记，同时避免瞬时失败造成界面噪声。

## Agent Context
- **源码入口：** `src/lib/editor.serializer.ts`、`src/components/sidebar.fileops.ts`、`src/components/statusbar.ts` 与 `src/lib/store.ts`。
- **关联规范：** `atomic-save`、`active-document-state`、`statusbar`。
- **不变量：** 保存失败不得清除 dirty 状态；连续失败达到阈值才显示持续警告；一次后续成功必须清除持续警告。
- **验证：** `npm test -- src/lib/autosave.test.ts`；`npx openspec validate autosave-reliability --strict`。

## Requirements

### Requirement: 自动保存失败的持续可见性
When automatic save fails, the system SHALL show a persistent, non-transient status (not a brief toast) and SHALL retain the document's dirty state.

#### Scenario: 连续自动保存失败
- **WHEN** 自动保存连续两次或多次失败（非交互模式）
- **THEN** 持续显示状态指示器，文档仍标记为脏

#### Scenario: 自动保存恢复
- **WHEN** 上次失败后，后续自动保存成功
- **THEN** 持续故障指示灯被清除

### Requirement: 保存失败时保留脏状态
在任何保存失败后，文档 MUST 保持脏标记，这样用户就不会被误导相信内容被持久化。

#### Scenario: 保存失败导致脏乱差
- **WHEN** 自动保存或交互保存失败
- **THEN** 脏标志未清除，编辑器关闭时继续提示

#### Scenario: 单次间歇性故障不发送垃圾邮件
- **WHEN** 单次自动保存失败但下一次成功
- **THEN** 只显示短暂的Toast，没有持续的指示符出现
