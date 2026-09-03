## ADDED Requirements

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

