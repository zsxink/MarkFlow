# source-patch-adapter Specification (Delta)

## MODIFIED Requirements

### Requirement: 从 transaction 生成 Utf16TextPatchDto

Adapter SHALL 从 CodeMirror 的 `Transaction.changes` 或 `Update.changes` 提取 change set。同一 batch 内的多个 transaction SHALL 使用 `ChangeSet.compose` 合成为单个 change set 后生成包含 UTF-16 range 的 `Utf16TextPatchDto`。不同 animation frame 或 batch 的 change 不得拼接；每个 batch SHALL 基于自己捕获时的 `confirmedRevision`。

#### Scenario: 同一 batch 合成而非按原始坐标拼接

- **WHEN** 初始文本为 `XYZ`，同一 batch 内有 3 个 transaction（依次插入 `a` 到文首、插入 `b` 到 `X` 后、插入 `c` 到 `Y` 后）
- **THEN** Adapter 使用 `ChangeSet.compose` 合成
- **THEN** 生成的 change 反映从起始 text 到最终 text 的变换，最终效果等价于 CodeMirror 顺序应用三个 transaction 得到的 `aXbYcZ`
- **THEN** Adapter 不得把后两个 transaction 当作起始文本坐标直接拼接，避免生成 `abcXYZ`、`aXYbZc` 等错误结果
