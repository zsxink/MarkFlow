## MODIFIED Requirements

### Requirement: 文件打开与内容加载

系统 SHALL 在真实 Tauri WebView 中验证文件打开后 CodeMirror surface 获得完整 Markdown，Live Preview 显示实际语义投影，并且打开操作不改变磁盘 bytes。

#### Scenario: 打开 welcome.md 后显示标题和段落语义
- **WHEN** 应用启动完成并从文件树打开 `welcome.md`
- **THEN** active editor surface 的底层 CodeMirror document 与 fixture 逻辑文本精确一致
- **THEN** Live Preview DOM/decoration 状态包含标题与段落语义，而不只是“区域中有文本”
- **THEN** 文件 hash 和 mtime 未因打开改变

#### Scenario: 打开多空行 fixture
- **WHEN** 分别打开包含文中空行以及文末 2/3 个 line-break boundaries 的 fixtures
- **THEN** CodeMirror document 包含全部逻辑换行
- **THEN** autosave 使用产品实际启用配置，不做编辑等待至少两个 tick 后 dirty 保持 false、save count 为 0
- **THEN** 磁盘 hash、长度与 mtime 不变，关闭不出现未保存提示

#### Scenario: 干净文档主动保存
- **WHEN** 用户打开 fixture 后不产生文档 transaction并主动保存
- **THEN** 保存返回 clean skip 或 Core 原始 byte payload
- **THEN** 不调用 ProseMirror serializer，磁盘 hash、长度与 mtime 不变

### Requirement: 编辑、保存与重新加载

系统 SHALL 在 Source 与 Live Preview 中验证局部编辑、Core patch flush、原子保存和重新加载。测试 MUST 比较完整 bytes/hash，并证明未触及区域保真，不能只断言包含新增文本。

#### Scenario: Live Preview 编辑正文后保留尾部空行
- **WHEN** fixture 为 `# 你好\n\n哈哈哈\n\n`
- **AND** 用户在 Live Preview 的 `哈哈哈` 中输入一个字符并保存
- **THEN** 磁盘文件只包含预期正文修改
- **THEN** 文末两个换行保持原字节
- **THEN** reload 后 Live Preview 继续显示标题和段落语义

#### Scenario: Live Preview 编辑正文后保留两个视觉空白行
- **WHEN** fixture 为 `# 你好\n\n哈哈哈\n\n\n`
- **AND** 用户只在正文中输入一个字符并保存
- **THEN** 文末三个 line-break boundaries 及其原始 EOL 类型保持不变
- **THEN** 报告同时记录 boundary 数量和视觉空白行数量，不能混用两个概念

#### Scenario: Source 编辑保存后 bytes 一致
- **WHEN** 用户在 Source 执行已知局部替换并保存
- **THEN** 保存 bytes 与基于 patch 生成的 golden bytes 完全一致
- **THEN** 未触及 prefix/suffix 与输入 fixture 逐字节一致

#### Scenario: 模式切换后保存
- **WHEN** 用户在 Source/Live Preview 间往返切换后保存
- **THEN** 模式切换未产生额外正文 diff
- **THEN** 磁盘 bytes 只包含用户编辑

## ADDED Requirements

### Requirement: Canonical byte fixture 矩阵

E2E/regression SHALL 使用覆盖 UTF-8 BOM、LF/CRLF/CR/Mixed EOL、文末 0/1/2/3 换行、CJK/emoji、列表/fence/frontmatter、图片、未知与损坏语法的 canonical fixtures，并记录输入与输出 hash。

#### Scenario: 无编辑矩阵
- **WHEN** 测试逐个打开 canonical fixtures、切换模式并等待至少两个 autosave tick
- **THEN** 每个 fixture 输出 hash 与输入 hash 相同
- **THEN** 干净文件 dirty=false、save count=0、mtime 不变且关闭无提示

#### Scenario: Smoke 配置关闭 autosave
- **WHEN** 某 smoke profile 使用 `autosave=false` 或不记录 save count/hash/mtime
- **THEN** 该结果只证明基础 UI smoke
- **THEN** 不得用于满足零编辑 lifecycle 或 byte fidelity gate

#### Scenario: 正文局部编辑矩阵
- **WHEN** 测试对每个 fixture 的已知正文 range 执行局部编辑
- **THEN** 输出与 golden patch bytes 相同
- **THEN** 未触及 spans 保持原字节

### Requirement: Live Preview 真实语义与降级 E2E

E2E SHALL 验证每个 default-on construct 的语义 projection、marker active/inactive 状态和 exact source fallback。Render IR/Widget 失败必须在真实 WebView 中证明文本仍可编辑保存。

#### Scenario: 基础 Markdown 语义
- **WHEN** fixture 包含 heading、strong、emphasis、inline code、link、quote、list 与 fence
- **THEN** 每个 default-on construct 具有对应语义 decoration/widget 状态
- **THEN** 底层 Markdown 文本未被投影修改

#### Scenario: 投影失败回退
- **WHEN** 测试注入 Render IR timeout 或 stale response
- **THEN** 失败范围显示源码并可继续输入
- **THEN** 保存后的 bytes 与用户 transaction 一致

### Requirement: 模式、IME 与 History 完整性 E2E

真实桌面测试 SHALL 覆盖单一 EditorView 模式切换、pending patch 保存、CJK composition 和跨模式 Undo/Redo，并记录 OS、WebView、输入法、flags 与 commit SHA。

#### Scenario: 100 次模式切换
- **WHEN** 测试在 Source/Live Preview 间切换 100 次
- **THEN** EditorView identity 不变
- **THEN** bytes、selection、scroll、dirty、revision 和 History 不变

#### Scenario: 中文 composition 后 Undo
- **WHEN** 用户使用中文输入法完成一次 composition
- **AND** 执行一次 Undo
- **THEN** 整次 composition 被撤销且无残留字符
- **THEN** Core confirmed text 与 CodeMirror text 收敛

### Requirement: Feature flag 与迁移路径 E2E

测试 SHALL 覆盖受支持的 feature flag 组合，并证明关闭投影只回退同一 CodeMirror Source，不会回到 ProseMirror serializer 保存。

#### Scenario: 关闭 Live Preview
- **WHEN** lossless session 开启但 `codemirrorLivePreview` 关闭
- **THEN** 文档以 Source 显示并正常局部编辑保存
- **THEN** 保存仍来自 Core confirmed payload

#### Scenario: Legacy 与 lossless owner 隔离
- **WHEN** 测试分别以 legacy 和 lossless flag 打开文档
- **THEN** 每个会话只有一个正文 owner
- **THEN** lossless 会话的保存路径不调用 ProseMirror serializer
