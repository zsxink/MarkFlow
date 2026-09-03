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

### Requirement: 表示转换不得制造虚假 dirty
解析、模式切换、资源地址替换、不透明片段恢复、基线建立和未包含用户内容变更的对账 SHALL 被视为程序化表示转换，不得递增用户编辑修订、设置 dirty 或触发自动保存。

#### Scenario: 打开文档并建立对账基线
- **WHEN** 系统加载磁盘 Markdown、创建 WYSIWYG 文档并建立对账基线
- **THEN** 文档保持 `dirty=false`
- **THEN** 自动保存不会仅因该流程触发

#### Scenario: 无编辑模式往返
- **WHEN** 用户未修改内容而执行 WYSIWYG → Source → WYSIWYG
- **THEN** 文档保持 `dirty=false`
- **THEN** 文件 mtime 不改变

#### Scenario: 仅发生安全规范化
- **WHEN** 对账发现的差异仅属于兼容策略允许的规范化且无用户编辑
- **THEN** 系统保留原始持久化基线
- **THEN** 文档保持 `dirty=false`

#### Scenario: 用户编辑后恢复不透明片段
- **WHEN** 用户修改受支持区域且序列化过程恢复未修改的不透明片段
- **THEN** 文档因用户编辑设置 `dirty=true`
- **THEN** 不透明片段恢复本身不产生额外修订

#### Scenario: 对账冲突
- **WHEN** 对账结果为冲突且没有安全保存候选
- **THEN** 自动保存不得写入磁盘
- **THEN** 冲突不得被错误标记为一次成功保存
