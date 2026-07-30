# M7: Tables, FrontMatter, Assets, Search and Diagnostics

> 状态：后续规划。拆分 M7A-M7D，依赖 M5/M6 的 Editor Adapter、Core command 和 History 边界。  
> 最后复核：2026-07-29。

## 阶段目标

覆盖 MarkFlow 的专业 Markdown 能力：

- 表格所见即所得编辑。
- FrontMatter 结构化编辑。
- 图片资源处理。
- 搜索。
- 诊断。
- 图表内置渲染。

本阶段不做插件系统。Mermaid、PlantUML、FrontMatter、GFM Table 都作为内置能力或内部 provider。

M7 不做一次性大交付，拆成可独立发布的子里程碑：

- M7A：GFM Table。
- M7B：FrontMatter。
- M7C：Assets transaction（证据：[m7c-assets-transaction-evidence.md](m7c-assets-transaction-evidence.md)）。
- M7D：Search、Diagnostics、Diagram renderer。

后一个子里程碑不能成为前一个子里程碑验收的阻塞条件。

每个子里程碑必须拥有独立 issue/OpenSpec change、feature flag 或回退开关、功能矩阵证据和 release note。M7A-M7D 的异步任务必须在 session close、reload、revision 变化或窗口关闭时取消；返回结果只允许落到匹配的 `sessionId + revision + requestId`。

## 技术方案

### 1. WYSIWYG Table Engine

Core 维护 table model：

```rust
pub struct TableModel {
    pub block_id: BlockId,
    pub range: SourceRange,
    pub columns: Vec<TableColumn>,
    pub rows: Vec<TableRow>,
    pub style: TableStyle,
}
```

WYSIWYG 支持：

- 单元格直接编辑。
- 插入行/列。
- 删除行/列。
- 设置列对齐。
- 表格内键盘导航。
- 列宽拖拽作为可选视图状态保留，不写入 Markdown；关闭或重开后按内容和 viewport 重新布局。

所有表格操作通过 Core command：

```rust
pub struct TableCommandRequest {
    pub session_id: SessionId,
    pub base_revision: Revision,
    pub command: TableCommand,
}

pub enum TableCommand {
    UpdateCell { table: BlockId, row: u32, col: u32, value: String },
    InsertRow { table: BlockId, at: u32 },
    DeleteRow { table: BlockId, at: u32 },
    InsertColumn { table: BlockId, at: u32 },
    DeleteColumn { table: BlockId, at: u32 },
    SetAlignment { table: BlockId, col: u32, alignment: Alignment },
}
```

command 携带 session id 和 base revision，返回 patch 和下一焦点 cell。Widget 中的输入只是 composition/draft 状态，不能直接成为文档真相；commit 后由 Core patch 更新同一 session 的 CodeMirror mirror。表格 draft、焦点 cell、列宽 UI state 必须按 `sessionId + block_id` 隔离。

首期只支持 GFM pipe table。parser 必须区分：

- delimiter pipe。
- escaped pipe `\|`。
- inline code 中的 pipe。
- 空 cell、缺失首尾 pipe 和不同 delimiter 长度。

保真策略：

- 未编辑列保持 alignment。
- 是否保留首尾 pipe 遵循原表格。
- 单 cell 内容修改只替换该 cell 的 content range；该 range 之外的 pipe、padding、alignment marker 和换行逐字节不变。
- 插入/删除行列或修改 alignment 可以重写当前 table block，但不得改写 table block 之外的字节；未受影响 cell 的内容值和既有 marker 风格必须保留。
- 像素列宽属于 UI state，不写回 Markdown。
- HTML table、非 GFM 或损坏 table 回退源码。

### 2. FrontMatter Structured Editor

FrontMatter 使用 lossless CST 解析，不能通过普通 serde AST round-trip 保存：

```rust
pub struct FrontMatterModel {
    pub range: SourceRange,
    pub format: FrontMatterFormat,
    pub fields: Vec<FrontMatterField>,
    pub trivia: Vec<FrontMatterTrivia>,
    pub structured_edit_safe: bool,
    pub unsafe_reasons: Vec<FrontMatterUnsafeReason>,
}
```

结构化编辑支持：

- 字段新增、删除、重命名。
- 字符串、数字、布尔、日期、数组基础类型。
- 字段顺序保持。
- 注释保持。
- 空行保持。
- 保存时只 patch FrontMatter range。

首期结构化入口只覆盖 `---` YAML FrontMatter。`+++` TOML、JSON FrontMatter 或自定义 delimiter 先作为源码保真块。

首期安全子集：

- YAML 顶层 mapping。
- string、number、boolean、null、date-like scalar。
- scalar array 和简单嵌套 mapping。

必须回退源码：

- duplicate key。
- anchor、alias、tag、merge key。
- 多文档 YAML。
- 损坏语法。
- 无法保证局部 patch 的复杂 block scalar。

结构化 UI 的每次提交调用 `FrontMatterCommand` 并携带 `sessionId + baseRevision`。UI 可以持有单字段 draft，但 draft 必须按 session 隔离；关闭面板、保存或切换文档前必须提交或明确放弃，不能把整份 FrontMatter 副本作为隐藏真相。

### 3. Assets Core

Core 负责生成 plan，Runtime/Host 使用 prepare/commit/rollback 事务：

- 解析相对路径、绝对路径、asset URL、网络 URL。
- 生成保存目标。
- 生成 Markdown 引用 patch。
- 处理首次保存时的暂存图片迁移。

Host 负责实际 IO 和权限。

流程：

1. UI/App Service 以 `sessionId + requestId` 发起资源操作。
2. Core 基于该 session 的 `DocumentSource` 与设置生成 `AssetPlan` 和 Markdown patch proposal。
3. Runtime 创建 `AssetTransaction { session_id, base_revision, request_id }`。
4. Host 在事务目录或目标安全位置 prepare/write/move 资源。
5. 所有必需资源成功后 Runtime 才提交文档 patch 和保存。
6. 失败时 Runtime 调用 Host rollback，Markdown 引用保持原状。

Host Asset Port 要求：

- Host 不生成 Markdown 引用，不读取编辑器文本。
- Host 返回文件 identity、权限错误、rollback 结果和可恢复状态。
- 同一路径多 session 同时插入图片时，资源命名必须由 Runtime/Core 的 transaction context 决定，不能只依赖全局时间戳。
- 另存为或未命名文档首次保存时，暂存资源必须绑定 session，不能被另一个文档认领。

### 4. Search

Core 提供搜索：

- plain text。
- case sensitive。
- whole word。
- 大文件分页。
- result range 映射到 CodeMirror selection。
- replace single/all 先生成 previewable patch set，并检查 base revision。

超过 1 MiB (1024 * 1024 bytes) 的文档必须分页搜索，不阻塞输入。

Search 请求和结果必须携带 `sessionId + revision + queryId`。切换文档后，旧查询结果只能保留在原 session 的搜索面板状态中，不能定位到新的 active editor。

### 5. Diagnostics

诊断来源：

- 坏链接。
- 缺失图片。
- 重复标题。
- FrontMatter 类型/schema 问题。
- 表格结构异常。
- 图表渲染错误。

诊断按 `sessionId + revision` 绑定，可取消，可按 viewport 返回。后台诊断任务必须在 session close、reload、revision 变化或窗口关闭时取消；返回结果必须校验 session 仍存在。

### 6. 图表内置 renderer

Mermaid / PlantUML 收敛为内部 renderer：

- 识别 code fence language。
- 输出 render request。
- Host/UI 执行实际渲染。
- 失败输出 diagnostic。
- 源码始终可编辑。

图表 render request 必须包含 `sessionId + revision + block range + requestId`。Host/UI 渲染结果只能回填到匹配 session 的 widget/diagnostic，不得按当前 active editor 盲目应用。

## 交付物

- WYSIWYG table editor。
- FrontMatter structured editor。
- Assets core plan。
- Search API。
- Diagnostics API。
- Mermaid/PlantUML 内置 renderer。
- M7A-M7D 各自的功能矩阵、测试证据和 release note。

## 验收标准

共同 gate：M7A-M7D 每项可独立打开、关闭和回退；任一子项失败不影响 Source Mode 保存。

- 表格可在 WYSIWYG 中直接编辑。
- escaped pipe、inline code pipe、空 cell 均不会破坏列边界。
- 编辑表格 cell 后，未编辑列 alignment 和 padding 保持。
- 插入/删除表格行列后，输出仍是合法 GFM table。
- FrontMatter 可通过结构化 UI 编辑。
- FrontMatter 保存后保留字段顺序、注释、空行和换行风格。
- 表格和 FrontMatter command 收到 stale block/revision 时拒绝提交并刷新视图，不覆盖新文本。
- 表格、FrontMatter、Search、Diagnostics、Diagram 的异步结果均按 session 隔离，不会串到另一个打开文档。
- unsafe FrontMatter 自动回退源码，结构化 UI 不可提交。
- 图片迁移后 Markdown 引用按设置生成相对或绝对路径。
- 首次保存迁移图片失败时，不写坏 Markdown。
- 图片文件成功但文档提交失败时有明确 rollback/recovery 记录。
- A 文档资源事务未完成时切换到 B，不会把图片写入 B 的资源目录或 Markdown。
- 搜索结果可以定位到 CodeMirror selection。
- 超过 1 MiB (1024 * 1024 bytes) 文档搜索分页返回，不阻塞输入。
- Diagnostics 可按 viewport 获取。
- 图表渲染失败不影响源码编辑和保存。

## 测试要求

- Core tests：table parse/edit/format。
- FrontMatter tests：字段编辑、注释保持、顺序保持、类型识别。
- Asset tests：relative path、absolute path、document-dir、document-named-dir、自定义目录。
- Search tests：中文、英文、大小写、分页。
- Search tests：stale revision、replace preview、replace all patch 冲突。
- Diagnostics tests：坏链接、缺失图片、重复标题、FrontMatter、表格结构。
- E2E：表格 WYSIWYG、FrontMatter 结构化编辑、图片保存、搜索定位、图表错误显示、A/B 文档切换下 draft 和异步任务隔离。

## 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 表格 WYSIWYG 复杂 | 先支持 GFM table，不追求任意表格方言 |
| FrontMatter 注释/空行保真复杂 | 保存时只 patch changed fields，保留 trivia |
| YAML lossless crate 能力不足 | M0 spike 决定方案；安全子集以外强制源码回退 |
| Asset 迁移涉及文件 IO 和权限 | Core 只生成 plan，Host 执行 IO |
| Diagnostics 阻塞大文件 | 所有诊断任务 revision-bound、可取消、可分页 |
| 多文档资源或异步结果串扰 | 所有 M7 transaction/task/result 绑定 `sessionId + revision + requestId` |
