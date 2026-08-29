## MODIFIED Requirements

### Requirement: 文档尺寸等级分类

系统 MUST 在打开前根据文件大小和行数将文档分级。所有等级 SHALL 使用同一 lossless Core/CodeMirror 文本主链；等级只限制解析、投影、widgets 和后台任务预算，不得切换到 serializer 或丢失原始内容。

- Normal: file size < 1MB AND line count < 5000
- Large: file size 1MB–10MB OR line count 5000–50000
- Huge: file size > 10MB OR line count > 50000

#### Scenario: Normal 文档完整 Live Preview
- **WHEN** 用户打开 500KB、2000 行文件
- **THEN** lossless session 与单一 CodeMirror surface 正常建立
- **THEN** 所有已验收且 default-on 的 Live Preview constructs 可用

#### Scenario: 文档正常打开，无降级
- **WHEN** 文件同时低于 Normal 的大小与行数阈值
- **THEN** 系统建立完整 lossless session 与默认 Live Preview
- **THEN** 不显示尺寸降级提示

#### Scenario: Large 文档 viewport 投影
- **WHEN** 用户打开 5MB、10000 行文件
- **THEN** 文本保持可编辑且保存保真合同不变
- **THEN** parser、decorations 和 widgets 限于 viewport 与受控 overscan
- **THEN** 系统显示非阻塞的 Large 状态

#### Scenario: 大文档显示建议
- **WHEN** 文件进入 Large 等级
- **THEN** 系统保持正文可编辑并显示降低重型投影、切换 Source 等非阻塞建议
- **THEN** 用户忽略建议时保存保真合同不变

#### Scenario: Huge 文档安全打开
- **WHEN** 用户打开 50MB、200000 行文件
- **THEN** 系统提供只读或强制编辑选择
- **THEN** 强制编辑仍使用同一 lossless text path，并默认关闭重型 widgets 与全文诊断
- **THEN** Source 始终可达

#### Scenario: 巨量文件需要确认
- **WHEN** 文件进入 Huge 等级
- **THEN** 系统在启用重型投影或强制可编辑模式前要求用户确认
- **THEN** 默认安全路径仍允许读取完整 Source，不裁剪保存内容

#### Scenario: 手动覆盖投影降级
- **WHEN** 用户在 Large/Huge 状态修改投影偏好
- **THEN** 只重配置 CodeMirror projection compartments
- **THEN** Core text、bytes、revision 与保存路径不变

#### Scenario: 手动超驰降级
- **WHEN** 用户明确覆盖 Large/Huge 默认投影限制
- **THEN** 系统仅调整有独立预算与 flag 的投影能力
- **THEN** 超驰不改变 Core、正文 owner 或保存路径

### Requirement: UI降级

系统 MUST 为 Large/Huge、projection degraded、patch blocked 和只读状态提供清晰、非重复且可恢复的 UI。可编辑降级状态 SHALL 提供 Source、Retry 或降低投影复杂度操作；这些操作不得更换正文 owner。

#### Scenario: Large 状态指示器
- **WHEN** Large 文档打开
- **THEN** 编辑器显示尺寸、当前投影预算和可用操作
- **THEN** 状态栏保留可重新打开的指示

#### Scenario: 降级模式指示器可见
- **WHEN** 文档处于 Large、Huge、projection degraded、patch blocked 或只读状态
- **THEN** 编辑器显示当前状态、原因与仍可用的恢复操作

#### Scenario: Projection degraded
- **WHEN** local parser/descriptor 异常，或异步 widget 服务失败
- **THEN** 失败范围回退源码且文本继续可编辑
- **THEN** 指示器提供 Retry 和 Source
- **THEN** 保存能力不受投影错误影响

#### Scenario: 大型等级的降级栏可取消
- **WHEN** Large 文档只显示建议性降级栏
- **THEN** 用户可以关闭该栏
- **THEN** 状态栏保留可重新打开的尺寸状态入口

#### Scenario: Patch blocked
- **WHEN** Core patch pipeline 无法收敛
- **THEN** UI 持续显示 blocked 状态与 resync/recovery 操作
- **THEN** 系统不得让用户误以为旧 revision 已保存

#### Scenario: 根据只读状态显示降级栏操作
- **WHEN** 文档因权限、Huge 安全策略或 recovery-only 状态只读
- **THEN** 降级栏只显示适用于只读状态的 Source、Save Copy、Retry 或恢复操作
- **THEN** 不显示会暗示可直接覆盖原文件的操作

## ADDED Requirements

### Requirement: 大文档性能降级不得牺牲字节保真

性能策略 MUST 通过减少投影和后台计算实现，不能通过裁剪文档、规范化内容或绕过 Core confirmed save 实现。

#### Scenario: Huge 文档只显示源码
- **WHEN** 性能预算要求 Huge 文档关闭 Live Preview
- **THEN** 完整 CodeMirror logical text 仍可读取或按只读策略显示
- **THEN** 未触及原始 bytes 保持可恢复
- **THEN** 系统不把可见 viewport 当作完整保存内容
