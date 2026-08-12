## ADDED Requirements

### Requirement: Core 从原始字节建立文档会话

系统 SHALL 从文件原始字节建立 lossless document session，并分别保存原始快照、逻辑 Markdown 文本、逐换行 EOL 映射、BOM、文件 identity、confirmed revision 与 persisted revision。系统 MUST NOT 先把文件转换为 ProseMirror 文档或经过 Markdown serializer 后再建立正文基线。

#### Scenario: 打开 UTF-8 BOM 与 Mixed EOL 文件
- **WHEN** 用户打开包含 UTF-8 BOM、LF/CRLF/CR 混合换行和文末空行的 Markdown 文件
- **THEN** Core session 的逻辑文本使用统一 `\n`
- **THEN** 原始 BOM、每个换行边界类型、文末换行数量和原始字节 hash 被记录
- **THEN** CodeMirror 收到完整逻辑文本，包括全部文中和文末空行

#### Scenario: 打开无效 UTF-8 文件
- **WHEN** 文件内容不是有效 UTF-8 或 UTF-8 BOM
- **THEN** 系统拒绝以可写 lossless session 打开该文件
- **THEN** 系统 MUST NOT 使用 replacement character 转换后覆盖原文件
- **THEN** 用户获得只读或显式转码选项

### Requirement: 未编辑保存严格 byte-to-byte

未发生确认编辑的文档，其保存 payload SHALL 与打开时的原始 bytes 完全相同。干净文档的自动保存 SHALL 跳过写盘并保持 mtime 不变。

#### Scenario: 打开后等待自动保存
- **WHEN** 用户打开文件后没有产生任何文档 transaction
- **AND** 自动保存 tick 触发
- **THEN** 系统不写入文件
- **THEN** 文件 hash、字节长度和 mtime 保持不变

#### Scenario: 显式保存干净文件
- **WHEN** 用户打开文件后未编辑并主动执行保存
- **THEN** Core 提供的保存 payload 与输入 bytes 逐字节相同
- **THEN** 保存流程不得调用 Markdown serializer 或规范化函数生成 payload

### Requirement: 编辑后未触及字节保持不变

系统 SHALL 把用户输入和编辑命令表示为有边界的局部文本 patch。每个 patch 未覆盖的存活原始 byte span MUST 在保存结果中保持逐字节相同。

#### Scenario: 修改正文保留文末空行
- **WHEN** 原文件内容等价于 `# 你好\n\n哈哈哈\n\n`
- **AND** 用户只在 `哈哈哈` 内插入一个字符
- **THEN** 保存结果中的文末两个换行与原文件字节一致
- **THEN** 标题、段落分隔和其他未触及区域与原文件字节一致

#### Scenario: 主动删除文末空行
- **WHEN** 用户把光标移动到文末并明确删除一个换行
- **THEN** 对应 patch 覆盖该换行边界
- **THEN** 保存结果只删除用户操作覆盖的换行
- **THEN** 其余未触及字节保持不变

#### Scenario: 多次局部编辑
- **WHEN** 用户在文档不同位置执行多次插入、删除和替换
- **THEN** 系统通过 patch/position transform 追踪仍存活的原始 spans
- **THEN** 保存结果中所有未被任何操作覆盖的 spans 与原始字节一致

### Requirement: EOL 与 BOM 按边界保留

Core SHALL 对每个逻辑换行维护其源 EOL 类型。未被编辑覆盖的 EOL 与 BOM MUST 原样保留；新增换行 SHALL 使用确定性的继承规则。

#### Scenario: 修改 Mixed EOL 文件的一行正文
- **WHEN** 文件同时包含 LF、CRLF 与 CR
- **AND** 用户修改某一行内的非换行文本
- **THEN** 所有原有换行边界保持各自的 EOL 类型
- **THEN** BOM 状态保持不变

#### Scenario: 插入普通换行
- **WHEN** CodeMirror transaction 插入一个普通 `\n`
- **THEN** Core 优先继承被替换边界的 EOL
- **THEN** 无被替换边界时依次使用右邻、左邻和文档主导 EOL
- **THEN** 文档主导 EOL 不存在时使用会话冻结的新文档默认 EOL

#### Scenario: 粘贴显式 CRLF
- **WHEN** 用户粘贴的 replacement 明确包含 CRLF
- **AND** paste 管线在 CodeMirror 归一化前把逐换行 provenance 写入 transaction annotation 与 Patch
- **THEN** 新增边界保留显式 CRLF

#### Scenario: Patch 的 EOL provenance 不合法
- **WHEN** `insertedLineEndings` 数量与 `insertedLogicalText` 中的逻辑换行数量不一致
- **THEN** Core 原子拒绝整个 Patch 并返回稳定的 invalid EOL provenance 错误
- **THEN** 文本、revision 与保存 payload 均保持不变

### Requirement: Revision-bound patch 原子确认

每个 patch SHALL 携带 binding generation、session/document identity、唯一 transaction ID、base revision、UTF-16 changes 和逐新增换行 provenance。Core MUST 验证 revision、Unicode boundary、change 顺序、重叠与 provenance，并以全有或全无方式应用。`fileIdentity` 只属于保存操作，不得用于拒绝合法的正文 patch/ack。

#### Scenario: 合法 patch 被确认
- **WHEN** patch 的 identity 与 base revision 匹配当前 session
- **AND** 所有 change 范围合法且互不重叠
- **THEN** Core 原子应用全部 changes
- **THEN** revision 增加并返回 confirmed revision

#### Scenario: stale revision 被拒绝
- **WHEN** patch 的 base revision 早于 Core confirmed revision
- **THEN** Core 返回稳定的 stale revision 错误
- **THEN** 文本、revision 和保存 payload 均保持不变

#### Scenario: retry 幂等
- **WHEN** 相同 transaction ID 与相同 payload 因网络/IPC 重试再次到达
- **THEN** Core 返回原确认结果且不重复应用
- **WHEN** 相同 transaction ID 携带不同 payload
- **THEN** Core 拒绝请求且不修改文档

### Requirement: 保存只使用 confirmed revision

保存 SHALL 在所有 pending CodeMirror transactions flush 并获得确认后，由 Core 为指定 revision 生成 payload。若存在 blocked patch、revision 不匹配或外部文件 identity 冲突，系统 MUST NOT 写盘。

#### Scenario: pending 输入后立即保存
- **WHEN** 用户输入后在 patch 尚未确认时点击保存
- **THEN** 系统等待有界 flush 完成
- **THEN** 保存 payload 包含该输入且 revision 与 ack 一致

#### Scenario: 写盘期间继续编辑
- **WHEN** revision N 的 payload 正在写盘
- **AND** 用户产生 revision N+1 的新编辑
- **THEN** 写盘成功只把 persisted revision 更新为 N
- **THEN** 文档继续保持 dirty，等待保存 N+1

#### Scenario: patch pipeline blocked
- **WHEN** patch retry 穷尽或 resync 尚未完成
- **THEN** 保存返回可恢复错误且不写入旧 snapshot
- **THEN** 用户文本仍保留在 CodeMirror optimistic mirror 中

### Requirement: 保存前检测外部修改

系统 MUST 在写盘前比较打开/上次保存记录的 file identity 与磁盘当前 identity。外部修改不能被自动保存静默覆盖。

#### Scenario: 自动保存遇到外部修改
- **WHEN** 磁盘文件在本应用外被修改
- **AND** 自动保存 tick 触发
- **THEN** 自动保存跳过写盘并进入 external conflict 状态
- **THEN** 外部文件保持不变

#### Scenario: 交互保存遇到外部修改
- **WHEN** 用户主动保存且 file identity 已变化
- **THEN** 系统显示 reload、另存冲突副本或明确覆盖选项
- **THEN** 未经用户明确确认不得覆盖外部内容

### Requirement: 持久化链路禁止隐式全文转换

lossless session 的打开、dirty、模式切换、自动保存、手动保存、reload 和 close 路径 MUST NOT 调用 ProseMirror serializer、`getMarkdown()`、`setMarkdown()`、`normalizeImageMarkdown()` 或 rendered DOM 来生成正文真相。

#### Scenario: 保存含图片和未知语法的文件
- **WHEN** 文档包含图片引用与当前 parser 不支持的 Markdown
- **AND** 用户修改一个普通段落后保存
- **THEN** 保存 payload 来自 Core buffer
- **THEN** 图片和未知语法的未触及源字节保持不变

#### Scenario: 投影服务失败
- **WHEN** Live Preview parser 或 Render IR 请求失败
- **THEN** lossless session 仍可继续编辑和保存
- **THEN** 保存内容不受投影失败影响
