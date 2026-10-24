# Spec Delta

## MODIFIED Requirements

### Requirement: 文档尺寸等级分类
系统 MUST 在打开前根据文件大小和行数将文档分为大小级别，体积与行数阈值取自用户设置（见 `document-limits-settings`），未配置时使用以下默认值：

- Normal: file size < 1MB AND line count < 5000
- Large: file size 1MB–10MB OR line count 5000–50000
- Huge: file size > 10MB OR line count > 50000

#### Scenario: 文档正常打开，无降级
- **WHEN** 用户打开一个大小为500KB、2000行的文件
- **THEN** 编辑器以完全所见即所得模式打开，没有任何降级通知
- **THEN** 所有编辑器功能均可无限制使用

#### Scenario: 大文档显示建议
- **WHEN** 用户打开一个大小为5MB、10000行的文件
- **THEN** 编辑器打开时会显示一条非阻塞通知，建议源模式
- **THEN** 用户可以关闭通知并继续以所见即所得的方式进行编辑
- **THEN** 自动序列化完整性检查被禁用

#### Scenario: 巨量文件需要确认
- **WHEN** 用户打开一个大小为50MB、200000行的文件
- **THEN** 显示确认对话框，其中包含文件大小、行数和两个选项：只读预览和强制打开
- **THEN** 如果用户选择只读预览，内容将显示为纯文本，无法编辑
- **THEN** 如果用户选择强制打开，编辑器将尝试在所有降级措施均处于活动状态的情况下打开
- **THEN** 持续可见的警告栏显示退化状态

#### Scenario: 手动超驰降级
- **WHEN** 文档处于降级模式（大或巨大）
- **THEN** 用户可以点击状态栏中的覆盖按钮来切换模式
- **THEN** 覆盖选项包括：强制所见即所得、强制源模式、重置为自动检测

### Requirement: 可配置阈值
尺寸等级分类的阈值 MUST 可在设置中配置，覆盖全部四个档位字段：`largeFileThreshold`、`hugeFileThreshold`、`largeFileLineThreshold`、`hugeFileLineThreshold`。输入校验规则见 `document-limits-settings`。

#### Scenario: 用户更改阈值
- **WHEN** 用户在设置中修改`largeFileThreshold`和`hugeFileThreshold`
- **THEN** 新阈值适用于下一次文件打开操作
- **THEN** 之前打开的文件不受影响

#### Scenario: 用户更改行数阈值
- **WHEN** 用户在设置中修改`largeFileLineThreshold`或`hugeFileLineThreshold`
- **THEN** 新行数阈值适用于下一次文件打开操作
- **THEN** 之前打开的文件不受影响
