# autosave-dirty-guard Specification

## Purpose
确保自动保存仅在文档有实际变更时触发写入，跳过干净文档和进行中的保存，避免无效 I/O 和并发冲突。

## Requirements

### Requirement: 自动保存仅处理脏文档
自动保存 tick SHALL 在文档无实际变更时不触发写入操作。

#### Scenario: 干净文档不触发保存
- **WHEN** 自动保存 tick 触发且文档未被编辑（`dirty=false`）
- **THEN** 不应调用 `saveActiveDocument`
- **THEN** 文件 mtime 不应改变

#### Scenario: 脏文档触发保存
- **WHEN** 自动保存 tick 触发且文档已被编辑（`dirty=true`）
- **THEN** 应调用一次 `saveActiveDocument`

### Requirement: 保存跳过不计为失败
自动保存的错误计数 SHALL 仅在实际写入失败时增加，主动跳过（干净文档、保存进行中）不应增加错误计数。

#### Scenario: 干净文档跳过不增加错误计数
- **WHEN** 自动保存 tick 因文档未修改而跳过
- **THEN** `autosaveErrorCount` 不应增加

#### Scenario: 保存进行中跳过不增加错误计数
- **WHEN** 自动保存 tick 因上一次保存仍在进行中而跳过
- **THEN** `autosaveErrorCount` 不应增加

#### Scenario: 实际写入失败增加错误计数
- **WHEN** 自动保存调用 `saveActiveDocument` 但写入失败
- **THEN** `autosaveErrorCount` 应增加 1

#### Scenario: 保存成功清零错误计数
- **WHEN** 自动保存调用 `saveActiveDocument` 且写入成功
- **THEN** `autosaveErrorCount` 应清零

#### Scenario: 连续 tick 不产生并发保存
- **WHEN** 上一次自动保存仍在进行中
- **THEN** 新的 tick 应跳过本次保存
