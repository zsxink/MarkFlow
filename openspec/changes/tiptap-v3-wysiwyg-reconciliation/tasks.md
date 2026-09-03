## 1. 迁移基线与版本筛选

- [x] 1.1 建立覆盖标题/行内标记/链接/图片/软硬换行/嵌套列表/任务列表/GFM 表格/普通代码块/Mermaid/PlantUML/文件尾换行/异常输入的固定 round-trip fixture corpus，并通过 fixture 清单测试验证每类至少包含正常与边界样例
- [x] 1.2 为当前 v2 转换链路增加只读基线测试，记录每个 fixture 的结构、序列化结果、已知损失和允许的规范化，并运行对应 Vitest 文件确认基线可重复
- [x] 1.3 用独立 spike 比较候选 TipTap v3 patch 对自定义 Marked 实例、扩展 tokenizer、软换行、列表续行、表格和图表 node view 的行为，输出版本选择记录并以 spike 测试全部通过作为验收
- [x] 1.4 测量现有文档大小分级下 parse→serialize→parse 的耗时和内存基线，记录 Source-only 性能阈值建议并通过可重复 benchmark 脚本验证结果可复现

## 2. TipTap v3 依赖与转换边界

- [x] 2.1 将全部 `@tiptap/*` 依赖锁定为同一个已验证 v3 patch，引入 `@tiptap/markdown` 和聚合列表/表格包，移除 v2 废弃包，并通过 `npm install`、`npm ls @tiptap/core @tiptap/pm @tiptap/markdown` 验证无多版本或 peer 冲突
- [x] 2.2 新增阶段一所需的 Markdown bridge 转换成功/失败联合类型，暂不加入资格、opaque 或 reconcile 会话模型，并通过类型级/构造器测试验证 parse/serialize 结果可穷尽处理
- [x] 2.3 实现由 bridge 独占的 TipTap v3 Markdown parse/serialize adapter，使用隔离 Marked 实例、`gfm=true`、`breaks=false` 和 Markdown content type，并通过最小 parse→serialize 测试验证调用方无需访问 TipTap storage
- [x] 2.4 实现阶段一的 `source-only ↔ v3-compatible` 模式与回退清理逻辑，预留但不实现 `gated/opaque/reconcile`，并通过模式测试验证降级后只使用完整 Source 内容
- [x] 2.5 实现不含正文的结构化转换诊断，限制字段和值长度并清理 URL query/图表源码，通过日志测试验证失败记录含 stage/code/range/length 且不含 fixture 原文

## 3. v3 Markdown 语法适配

- [x] 3.1 配置 StarterKit 并禁用所有由 MarkFlow 自定义注册的 Link、列表、代码块等重复扩展，通过 schema/extension-name 测试验证每个能力只注册一次
- [x] 3.2 将 `CustomLink` 迁移到 v3 parse/render/tokenizer hooks，保持 autolink 与 link-on-paste 关闭，并通过 href 括号/引号转义、title、嵌套 mark 和粘贴行为测试
- [x] 3.3 将图片 Markdown 适配与 runtime asset URL 映射接入 bridge，保留 alt/title/原始地址，并通过本地相对路径、远程 URL、asset URL round-trip 测试验证磁盘候选不含 runtime URL
- [x] 3.4 迁移普通围栏代码块 adapter，实现语言/信息字符串、安全围栏长度和 0..N 尾随换行保真，并运行 `code-block-serialization` 对应 fixture/单元测试
- [x] 3.5 迁移 Mermaid/PlantUML persistence hooks，保持图表类型与源码独立于 node-view 渲染状态，并通过两类图表的成功、空白、错误和未配置服务 round-trip 测试
- [x] 3.6 迁移普通/有序/嵌套/任务列表 adapter，处理续行、缩进和 checked 状态，并通过列表组合 corpus 验证 parse→serialize→parse 结构一致
- [x] 3.7 迁移 GFM 表格 adapter，覆盖空单元格、转义竖线、行内标记和列数一致性，并通过表格 corpus 验证结果不退化为 HTML
- [x] 3.8 增加 CommonMark soft break 兼容适配并区分显式 hard break，通过硬换行、段内软折行、代码块换行测试验证 WYSIWYG 显示语义和序列化语义正确
- [x] 3.9 让未知 node/mark 或部分序列化返回显式失败而非空串/纯文本 fallback，并通过故意注入未知 schema 节点的测试验证不会产生可保存候选

## 4. 编辑器、Source 与保存链路接入

- [x] 4.1 将编辑器初始化和 `setMarkdown` 改为通过 bridge 解析完整 Markdown，并用嵌套的 scoped programmatic guard 包裹程序化事务，通过打开文档测试验证不递增用户 revision 或 dirty
- [x] 4.2 将 `getMarkdown`、dirty 检查和图片/文件尾换行恢复统一到 bridge 的成功候选，删除业务层直接 storage 读取，并用 `rg` 断言非 adapter 代码不存在 `storage.markdown` 调用
- [x] 4.3 改造 WYSIWYG → Source 切换以使用阶段一 bridge 的完整序列化结果，并通过正常、转换失败和无编辑往返测试验证 Source 不含 runtime URL 且 dirty 不变
- [x] 4.4 改造 Source → WYSIWYG 切换以使用 v3 Markdown content type 完整解析，转换失败时保留 CM6 与原文；本任务不实现资格分类，并通过成功/失败两条模式切换测试
- [x] 4.5 将手动保存、自动保存、冲突保存和待处理图片保存接到阶段一 bridge 的同步序列化边界，保留既有保存冲突语义且不实现 reconcile，并通过 sidebar save 测试验证转换失败不会调用磁盘写入
- [x] 4.6 将 scoped programmatic guard 做成可嵌套且 `try/finally` 安全的计数/令牌机制，并通过嵌套、抛错和延迟 scheduler 测试验证 guard 不会提前清除或永久卡住

## 5. 阶段一验收门禁（硬停止点）

- [x] 5.1 验证依赖门禁：运行 `npm ls @tiptap/core @tiptap/pm @tiptap/markdown` 并扫描 lockfile，确认所有 TipTap 包为同一精确 v3 patch、无 peer 冲突且不存在 v2 Markdown/list/table 废弃包；把命令与结果写入 `evidence/stage-1-validation.md`
- [x] 5.2 验证编译门禁：分别运行 `npx tsc --noEmit` 与 `npm run build`，两者必须退出 0 且不得忽略 TipTap 类型错误；把命令、版本和结果写入阶段一验收报告
- [x] 5.3 验证现有回归门禁：从两个独立干净进程连续运行两次 `npm test`，两次都必须零失败且不得跳过迁移相关测试；把用例数、失败数和耗时写入阶段一验收报告
- [x] 5.4 验证差分语料门禁：运行完整 v2 baseline 与 v3 corpus 对比，100% 受支持 fixture 必须保留文本、结构和 authored attributes；每个输出差异必须有命名 canonicalization 断言，否则门禁失败
- [x] 5.5 验证磁盘安全门禁：运行无编辑和有编辑的关键 Tauri E2E；无编辑 fixture 在打开、双向切换、保存、重载后不得出现意外字节变化，有编辑 fixture 必须与评审过的 expected 文件逐字节一致
- [x] 5.6 验证真实文档只读扫描门禁：对至少 30 份覆盖表格、列表、链接、图片、代码块和图表的代表性 Markdown 执行不落盘 v2/v3 differential scan，要求零未分类截断、内容丢失或结构丢失，并只记录摘要/digest 不记录正文
- [x] 5.7 验证交互门禁：按记录表检查链接输入/粘贴、图片粘贴/拖放、嵌套与任务列表、表格编辑、代码块、Mermaid、PlantUML 和 Source/WYSIWYG 切换，要求零新功能回归、零未解释控制台错误（自动化 DOM/unit/e2e 子集全部 PASS；图片真实粘贴/拖放、图表 node-view 渲染、手动表格编辑 3 项留给维护者最终验收）
- [x] 5.8 验证性能门禁：对小/中/大 fixture 运行基准，要求中/大文档 parse→serialize→parse 的 p95 相对阶段一基线退化不超过 25%、无持续内存增长，并通过现有 bundle budget 检查
- [x] 5.9 验证回退门禁：在可恢复的测试分支/提交上演练成组回退 v3 dependency、lockfile 和 adapter 改动，确认 v2 构建恢复且同一批 fixture 无需数据迁移即可打开；记录回退命令与结果后恢复工作分支
- [x] 5.10 汇总 `evidence/stage-1-validation.md`：所有门禁只能标记 PASS 或 FAIL，`WAIVED`、`UNKNOWN`、跳过测试和未解释 diff 一律视为 FAIL；仅当全部 PASS 且维护者记录批准后才可勾选本项并进入第 6 节，否则停止 apply、修复或回退并从 5.1 重跑

## 6. WYSIWYG 资格门禁

- [x] 6.1 在阶段一验收报告全部 PASS 且维护者批准后，扩展 bridge 类型和 pipeline mode 以支持 eligibility/opaque/reconcile；若批准记录不存在则停止 apply，并通过 gate 测试验证阶段二代码不可启用
- [x] 6.2 实现受支持语法、初始 opaque allowlist 和 source-only 语法的确定性分类器，并通过 corpus 表驱动测试验证每个 fixture 返回稳定状态与原因码
- [x] 6.3 实现去除 runtime-only 属性的语义 fingerprint 与显式 canonicalization policy，通过等价/不等价成对 fixture 验证只接受登记的格式差异
- [x] 6.4 在 admission 时执行 parse→serialize→restore→parse 验证，并通过结构丢失、属性丢失、顺序变化和正常文档测试验证不安全文档一律为 `source-only`
- [x] 6.5 接入打开文件与模式切换 UI：`eligible` 进入 WYSIWYG，`source-only` 保持 Source 并显示稳定原因，通过 DOM/E2E 测试验证拒绝不会改写磁盘或销毁 CM6
- [x] 6.6 为 pipeline `gated` 模式增加 kill-switch 回退测试，验证切到 `source-only` 会清除会话并从原始 Markdown 重新加载 Source

## 7. Opaque 片段透传

- [x] 7.1 实现 YAML front matter、完整块 HTML 和 HTML comment 的精确 range scanner，遇到未闭合/重叠/歧义边界时返回 source-only，并通过边界与恶意输入 fixture 测试
- [x] 7.2 实现带随机 session nonce、输入碰撞检查和 digest 的 opaque registry/sentinel 生成，通过重复片段、伪造 sentinel 和随机碰撞模拟测试验证 slot 唯一
- [x] 7.3 新增非编辑 opaque atom extension 与安全 node view，节点只保存 slot/category 而不保存 raw payload，并通过 ProseMirror JSON/DOM 测试验证正文和原始 HTML 不泄露
- [x] 7.4 实现 opaque render 后的一对一恢复与最终 no-sentinel 断言，通过缺失、重复、重排、未知 slot 和正常多片段测试验证异常只返回 conflict
- [x] 7.5 实现 opaque 节点的复制/剪切/粘贴策略，复制输出原始 Markdown、外来 sentinel 不可解析为内部节点，并通过 ClipboardEvent 集成测试验证剪贴板不含内部 token
- [x] 7.6 在文档切换、reload、pipeline 降级和 editor destroy 时清除 opaque registry，通过生命周期测试验证旧 slot 不能在新会话恢复

## 8. 三方对账与 dirty/autosave

- [x] 8.1 在 admission 后记录 exact source baseline、verified render baseline、semantic fingerprint、source revision、user revision 与 opaque registry，并通过会话创建测试验证字段来自同一次验证事务
- [x] 8.2 实现纯函数 reconcile classifier，覆盖 `unchanged`、`safe-edit`、`conflict` 以及允许规范化、用户编辑、stale revision、semantic mismatch、opaque mismatch 矩阵，并运行表驱动单元测试
- [x] 8.3 在无用户编辑的 `unchanged` 路径返回 exact source baseline，通过包含不同换行符、文件尾换行和非首选标记风格的 fixture 验证不发生字节重写
- [x] 8.4 在 `safe-edit` 路径验证候选可重新解析为当前 editor fingerprint 后才返回保存内容，通过编辑支持区域且保留多个 opaque 片段的集成测试
- [x] 8.5 为 `conflict` 增加独立 store 状态、自动保存抑制和手动保存提示，通过 autosave/手动保存测试验证不写磁盘、不清除 dirty、不报告保存成功
- [x] 8.6 将 dirty 派生改为成功候选与 persisted baseline 的比较，并让 scheduler 丢弃过期 revision/session 结果，通过快速连续编辑、保存中编辑和模式往返测试
- [x] 8.7 在外部修改 reload、活动文档切换和 Source 编辑后使旧会话失效并重新 admission，通过 external-modification 集成测试验证旧 baseline/slot 不会复用
- [x] 8.8 实现冲突恢复 UI，允许用户明确选择保留原文并进入 Source 或复制可恢复候选，通过 E2E 验证默认动作不覆盖磁盘且 Source 不含内部表示

## 9. 清理、性能与回归

- [x] 9.1 从正常保存与模式切换移除 `checkSerializationIntegrity` 长度启发式和 `extractDocAsFallback` 的持久化职责，仅保留显式恢复工具或删除无调用代码，并用 `rg` 与相应测试验证无静默 fallback
- [x] 9.2 删除阶段一遗留的过渡兼容代码和无用 patch，并再次运行 `npm ls` 与 bundle 构建确认 v2 Markdown storage hooks、`tiptap-markdown` 和废弃 task/table 分包仍完全不存在
- [x] 9.3 为完整 fixture corpus 建立新引擎迁移对比报告，断言所有受支持样例无新增文本/结构/属性损失且每个允许规范化有命名测试
- [x] 9.4 在小/中/大文档和大量 opaque 片段场景运行 benchmark，确认 admission/reconcile 达到 1.4 的阈值；超限时按已有文档大小分级降级 Source 并复跑测试
- [x] 9.5 运行 Mermaid/PlantUML、图片、表格、列表、链接、文件尾换行、模式切换、external modification、dirty/autosave 全部相关 Vitest，修复后确保 `npm test` 零失败
- [x] 9.6 运行 `npx tsc --noEmit` 与 `npm run build`，确认 TipTap v3 强类型、扩展签名和生产 bundle 构建均零错误
- [x] 9.7 运行关键 Tauri E2E：打开→WYSIWYG 编辑→Source→WYSIWYG→保存→重载，以及 source-only、opaque、conflict 恢复路径，并确认磁盘 fixture 与预期逐字节一致（真实 Tauri 窗口 smoke 套件 exit 0 全绿含 disk-safety 逐字节门禁；source-only/opaque/conflict 恢复路径由相应单元/组件测试覆盖，见 `evidence/stage-2-validation.md` §6b 覆盖边界）

## 10. 交付门禁

- [x] 10.1 更新与实现一致的编辑器架构/迁移说明和 pipeline mode 运维说明，并通过文档中的命令与路径逐项核对可执行
- [x] 10.2 运行 `npx openspec validate tiptap-v3-wysiwyg-reconciliation --strict` 与 `npx openspec validate --all`，确认 change 和主规范均无错误
- [x] 10.3 汇总各阶段 exit gate、已知 canonicalization、source-only 原因和回退演练证据，并验证从 `reconcile` 逐级降到 `source-only` 时原始 fixture 均可读取保存
- [x] 10.4 在 merge 或 archive 前派独立 reviewer agent 静态复核实现与规范，并由 reviewer 运行 `npm test`、`npx tsc --noEmit` 和关键回归命令；只有复核无阻断问题后才进入合入/归档（第 11、12 节完成后须重新复核）

## 11. 真实文档 WYSIWYG admission 回归

- [x] 11.1 让 eligibility 扫描屏蔽围栏代码与完整行内代码，并增加 HTML、数学、脚注和引用链接字面量回归测试
- [x] 11.2 在 eligibility 阶段识别表头、分隔行或数据行列数不一致的 GFM 表格，确保可能丢失单元格的文档保持 `source-only`
- [x] 11.3 规范化两条 TipTap 解析路径的缺省/null 属性、扩展默认属性、默认列表/表格值和 mark 集合顺序，同时保留非默认 authored values 的指纹差异
- [x] 11.4 增加 frontmatter + 表格/链接/图片、代码字面量和畸形表格的完整 admission 回归语料，验证误拒绝文档恢复 WYSIWYG 且不安全文档继续降级 Source
- [x] 11.5 运行相关 Vitest、完整 `npm test`、`npx tsc --noEmit`、`npm run build` 与 OpenSpec 校验，确认回归修复满足现有安全契约

## 12. Orca 技术栈对齐收口

- [x] 12.1 建立完整 B 与 Orca Markdown 核心栈的可审计映射，逐项确认 TipTap/ProseMirror v3、`@tiptap/markdown`、隔离 Marked 兼容实例/门面、Markdown content type、`markdownTokenizer` / `renderMarkdown` hooks、资格门禁、opaque placeholder 和 reconcile 均由当前权威链路承载；同时登记 patch 与应用壳差异为允许差异
- [x] 12.2 增加依赖与源码门禁，验证生产依赖不存在 `tiptap-markdown` 或 markdown-it 转换器、业务代码不存在 `storage.markdown` 直连、所有 Markdown 解析/序列化/保存候选都经统一 bridge；markdown-it 仅可存在于只读 v2 差分测试
- [x] 12.3 增加生产调用链集成测试，验证普通 `eligible` 与 `eligible-with-opaque` 文档在完整 B 下均建立同一类已验证会话，并在保存与 Source 切换时经过 reconcile；缺失 session/registry 或内部 token 泄漏必须 fail closed，不能回退 legacy 保存
- [x] 12.4 更新架构说明和阶段二证据中的 Orca 对齐矩阵，运行 `npm test`、`npx tsc --noEmit`、`npm run build`、`npx openspec validate tiptap-v3-wysiwyg-reconciliation --strict` 与 `npx openspec validate --all`，所有门禁通过后再执行 10.4 独立复核
