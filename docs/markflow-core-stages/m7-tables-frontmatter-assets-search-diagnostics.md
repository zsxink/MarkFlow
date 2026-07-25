# M7: Tables, FrontMatter, Assets, Search and Diagnostics

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
- M7C：Assets transaction。
- M7D：Search、Diagnostics、Diagram renderer。

后一个子里程碑不能成为前一个子里程碑验收的阻塞条件。

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
pub enum TableCommand {
    UpdateCell { table: BlockId, row: u32, col: u32, value: String },
    InsertRow { table: BlockId, at: u32 },
    DeleteRow { table: BlockId, at: u32 },
    InsertColumn { table: BlockId, at: u32 },
    DeleteColumn { table: BlockId, at: u32 },
    SetAlignment { table: BlockId, col: u32, alignment: Alignment },
}
```

command 携带 base revision，返回 patch 和下一焦点 cell。Widget 中的输入只是 composition/draft 状态，不能直接成为文档真相；commit 后由 Core patch 更新 CodeMirror mirror。

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

结构化 UI 的每次提交调用 `FrontMatterCommand` 并携带 base revision。UI 可以持有单字段 draft，但关闭面板、保存或切换文档前必须提交或明确放弃，不能把整份 FrontMatter 副本作为隐藏真相。

### 3. Assets Core

Core 负责生成 plan，Runtime/Host 使用 prepare/commit/rollback 事务：

- 解析相对路径、绝对路径、asset URL、网络 URL。
- 生成保存目标。
- 生成 Markdown 引用 patch。
- 处理首次保存时的暂存图片迁移。

Host 负责实际 IO 和权限。

流程：

1. Core 生成 `AssetPlan` 和 Markdown patch proposal。
2. Host 安全写入或迁移资源。
3. 所有必需资源成功后 Runtime 才提交文档 patch 和保存。
4. 失败时回滚临时资源，Markdown 引用保持原状。

### 4. Search

Core 提供搜索：

- plain text。
- case sensitive。
- whole word。
- 大文件分页。
- result range 映射到 CodeMirror selection。
- replace single/all 先生成 previewable patch set，并检查 base revision。

超过 1MB 的文档必须分页搜索，不阻塞输入。

### 5. Diagnostics

诊断来源：

- 坏链接。
- 缺失图片。
- 重复标题。
- FrontMatter 类型/schema 问题。
- 表格结构异常。
- 图表渲染错误。

诊断按 revision 绑定，可取消，可按 viewport 返回。

### 6. 图表内置 renderer

Mermaid / PlantUML 收敛为内部 renderer：

- 识别 code fence language。
- 输出 render request。
- Host/UI 执行实际渲染。
- 失败输出 diagnostic。
- 源码始终可编辑。

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
- unsafe FrontMatter 自动回退源码，结构化 UI 不可提交。
- 图片迁移后 Markdown 引用按设置生成相对或绝对路径。
- 首次保存迁移图片失败时，不写坏 Markdown。
- 图片文件成功但文档提交失败时有明确 rollback/recovery 记录。
- 搜索结果可以定位到 CodeMirror selection。
- 超过 1MB 文档搜索分页返回，不阻塞输入。
- Diagnostics 可按 viewport 获取。
- 图表渲染失败不影响源码编辑和保存。

## 测试要求

- Core tests：table parse/edit/format。
- FrontMatter tests：字段编辑、注释保持、顺序保持、类型识别。
- Asset tests：relative path、absolute path、document-dir、document-named-dir、自定义目录。
- Search tests：中文、英文、大小写、分页。
- Search tests：stale revision、replace preview、replace all patch 冲突。
- Diagnostics tests：坏链接、缺失图片、重复标题、FrontMatter、表格结构。
- E2E：表格 WYSIWYG、FrontMatter 结构化编辑、图片保存、搜索定位、图表错误显示。

## 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 表格 WYSIWYG 复杂 | 先支持 GFM table，不追求任意表格方言 |
| FrontMatter 注释/空行保真复杂 | 保存时只 patch changed fields，保留 trivia |
| YAML lossless crate 能力不足 | M0 spike 决定方案；安全子集以外强制源码回退 |
| Asset 迁移涉及文件 IO 和权限 | Core 只生成 plan，Host 执行 IO |
| Diagnostics 阻塞大文件 | 所有诊断任务 revision-bound、可取消、可分页 |
