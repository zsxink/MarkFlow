## MODIFIED Requirements

### Requirement: WYSIWYG 与 Source 双向内容同步

系统 SHALL 通过统一 Markdown 转换边界确保 WYSIWYG 和 Source 模式间的内容一致性。切换到 Source 时，内容 SHALL 是通过完整性与对账验证的可持久化 Markdown；切换回 WYSIWYG 时，Source 修改 SHALL 先经过资格检查，再完整应用到可编辑文档或保留在 Source。

#### Scenario: WYSIWYG → Source 同步
- **WHEN** 用户从 WYSIWYG 切换到源码模式且当前序列化候选通过完整性与对账验证
- **THEN** CM6 文档内容等于验证后的可持久化 Markdown
- **THEN** 内容不包含占位 token、运行时资源 URL 或内部元数据
- **THEN** dirty 标志不因模式切换而改变

#### Scenario: Source → WYSIWYG 同步
- **WHEN** 用户从源码模式切换到 WYSIWYG 且当前 Source 内容通过资格检查
- **THEN** 完整 Source 内容被解析为 WYSIWYG 文档并建立新的对账基线
- **THEN** 同步后 CM6 实例被销毁

#### Scenario: Source 内容不满足 WYSIWYG 资格
- **WHEN** 用户从源码模式切换到 WYSIWYG且当前 Source 内容的资格结果为 `source-only`
- **THEN** CM6 实例和完整 Source 内容保持可用
- **THEN** 系统说明无法安全进入 WYSIWYG 的原因

#### Scenario: 外部 setMarkdown 同步到 CM6
- **WHEN** 系统设置新的 Markdown 且当前为源码模式
- **THEN** CM6 文档被替换为完整的新内容
- **THEN** 该程序化替换不触发用户编辑回调或虚假 dirty

## ADDED Requirements

### Requirement: Source 是 WYSIWYG 失败时的完整恢复面
当 WYSIWYG 资格检查、解析、序列化或对账失败时，Source 模式 SHALL 提供不含内部占位表示的完整 Markdown，并 SHALL 允许用户在不经过失败 WYSIWYG 路径的情况下继续编辑和保存。

#### Scenario: 资格检查拒绝后保持 Source
- **WHEN** 文档因无法安全往返而被 WYSIWYG 资格检查拒绝
- **THEN** Source 显示完整原始 Markdown
- **THEN** 用户可直接编辑和保存该内容

#### Scenario: 对账冲突后切换 Source
- **WHEN** WYSIWYG 对账发生冲突且用户选择切换到 Source
- **THEN** Source 显示明确选定的安全恢复版本
- **THEN** 未经用户选择的冲突候选不会覆盖该版本

