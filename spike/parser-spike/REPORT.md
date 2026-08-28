# P4A 任务 6.1 — Parser 候选 range 对比报告（spike）

- change：`refactor-lossless-live-preview`（Issue #254 program），Phase P4A，任务 6.1
- 分支：`test/issue-255-lossless-byte-contract` @ `f189b0c`（spike 文件未提交，由调度器统一提交）
- 日期：2026-08-29
- 性质：**spike 证据报告**。最终 ADR（`GO_CORE_IR` / `SPIKE_COMPLETE_NO_CORE_IR`）属任务 6.3，本报告只提供候选级 qualify/disqualify 初步结论与证据索引。
- 证据 run：见 `openspec/changes/refactor-lossless-live-preview/validation/evidence/P4A/<run-id>/`（RUN.md 索引全部原始输出）。

## 1. 评估方法

### 1.1 判据（来自 design/05-render-ir-widgets-nfr.md §1）

CommonMark/GFM 覆盖；source/content/marker range 精度；malformed/unknown fallback；UTF-16/UTF-8/EOL 映射；incremental/viewport 性能；AST identity；WASM/IPC payload；许可、维护活跃度、供应链风险。Parser 只提供 ranges/structure/diagnostics，绝不成为保存 serializer。

### 1.2 统一 fixtures 与坐标系

- Fixtures：`tests/fixtures/byte-contract/fixtures/*.md`（25 个 canonical，确定性合成）+ 1 个 spike 补充 fixture `spike/parser-spike/extra-fixtures/spike-extra-task-inline.md`（task checkbox / 嵌套 inline / escape / inlineCode / strikethrough / autolink —— canonical 集合缺失、P4B cohort 需要的构造；同为确定性合成，绝不使用用户文档）。
- 评估对象 = **逻辑 LF 文本**：源字节解码 UTF-8、剥 BOM、CRLF/CR → LF。EOL 还原是 Core LineEndingMap 的职责（design/04），不在本 spike 范围。混合 EOL fixture（`utf8-mixed-tail2` 等）在逻辑文本上与 LF 版本行为一致，已验证。
- 报告统一坐标系：**UTF-16 code unit、半开区间 [start,end)**。Rust 候选原生坐标（UTF-8 byte offset / comrak 行列）经 `CoordMap` 双向映射转换，转换正确性由 round-trip 反向验证（任何转换错位都会造成 slice 不匹配）。
- 坐标探针（`# 😀`）：UTF-8 byte end=6 / UTF-16 end=4 / code point end=3。实测：Lezer `headingTo`=4 与 JS 字符串长度相等 → **UTF-16 CONFIRMED**；markdown-rs/pulldown end offset=6 → **UTF-8 bytes CONFIRMED**；comrak end col=6（`#`1+空格1+emoji 4 byte）→ **byte columns CONFIRMED**，且 end column 指向**最后一个字节**而非 one-past-end，转换规则已按此实现。

### 1.3 Round-trip 门禁（冻结期望表）

`spike/parser-spike/expectations.json`：从验证过的 Lezer 参考 dump（`explore/dump-lezer.mjs`）推导、并**逐条人工对照 canonical fixture 定义核对**后冻结。全部候选（TS+Rust）对同一张表判定：

| 判定 | 含义 |
| --- | --- |
| MATCH | `text.slice(sourceRange)` 与期望 source 完全相等 |
| CONVENTION | 仅差尾随空白（如 pulldown 块级 span 含尾随 `\n`）——记录为约定差异，不判失败 |
| SPURIOUS | 候选报告了表中没有的构造（误判证据，如 Lezer 把 frontmatter 体判成 SetextHeading） |
| INVALID | 越界/嵌套不变量破坏/slice 与任何期望不符 —— **硬失败** |
| MISS | 表中期望的构造候选没有产出 —— 覆盖缺口（记录数据） |

辅助检查：contentRange（inline 类精确比较、block 类 trim 比较）、markerRanges（与期望定界符串做多重集比较；候选未提供记 `none-provided` 覆盖缺口）、包裹型类别 marker 不得与 content 相交、malformed fixture（`requireAll=false`）只记录 fallback 行为不计 SPURIOUS/MISS。

## 2. 候选与版本

| 候选 | 语言 | 包/版本（本机实测） | 最新版（发布日期） | License |
| --- | --- | --- | --- | --- |
| A. CodeMirror Lezer (+GFM) | TS | `@codemirror/lang-markdown` 6.5.0 + `@lezer/markdown` 1.7.0（**产品内嵌依赖**，`markdown({extensions:[GFM]}).language.parser`，与 `losslessSourceEditor.ts` 完全一致） | 6.5.2 (2026-08-04) / 1.7.2 (2026-07-15) | MIT |
| B. markdown-rs（mdast） | Rust | `markdown` 1.0.0（GFM + footnotes + frontmatter constructs 全开） | 1.0.0 (2025-04-23) | MIT |
| C. pulldown-cmark | Rust | `pulldown-cmark` 0.13.4（TABLES/STRIKETHROUGH/TASKLISTS/FOOTNOTES） | 0.13.4 (2026-05-20) | MIT |
| D. comrak | Rust | `comrak` 0.54.0（table/strikethrough/tasklist/autolink/footnotes/front_matter_delimiter） | 0.54.0 (2026-07-12) | BSD-2-Clause |
| E. draft ParseIndex | Java | — | — | — |

E（draft ParseIndex）为 **excluded candidate**：ParseIndex 是 draft-js 的内部模块（无公开稳定 API），且 Tauri 运行时为 Rust+TS、无 JVM——运行时不可达，无法纳入统一 fixtures 比较。记录在案，不参与评级。

## 3. Range round-trip 结果（25 canonical + 1 spike fixture，共 88 处期望构造）

| 候选 | MATCH | CONVENTION | SPURIOUS | **INVALID** | MISS | content 不匹配 | marker 缺失 | marker 不匹配 | malformed panic/throw |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Lezer | 87 | 0 | 4 | **0** | 1 | 0 | 0 | 0 | 无（no throw） |
| markdown-rs | 75 | 7 | 4 | **0** | 6 | 0 | 33 | 0 | 无（catch_unwind 未捕获到 panic） |
| pulldown-cmark | 19 | 57 | 3 | **0** | 12 | 0 | 33 | 0 | 无 |
| comrak | 83 | 1 | 3 | **0** | 4 | 0 | 33 | 0 | 无 |

四个候选全部 **0 INVALID**：任何被报告的 range 都能精确回切到 canonical 期望源文本。差异全部在「覆盖面」与「约定」上，逐类归因如下。

### 3.1 逐候选残余差异（全部为真实能力差异，非转换缺陷）

**Lezer（4 SPUR + 1 MISS，全部集中在 frontmatter）**
- `syntax-frontmatter`：无 frontmatter 节点。`---` → HorizontalRule、`# comment line` → ATXHeading、`title:…\n---` → **SetextHeading2**（误判证据：会投影成 h2 样式）、`[a, b, c]` → Link。
- 其余 24 个 fixture 全 MATCH；marker 全数提供（marker 缺失 = 0）。

**markdown-rs（mdast）**
- 无 marker/delimiter 信息（mdast position-only）→ marker 缺失 33 处。
- `TableRow` 无 `isHeader` 字段（1.0.0 mdast）→ 表头行不可区分。
- GFM task list：`listItem.checked: bool` 有，但 **checkbox span 无处可取**（taskCheckbox ×2 MISS）。
- 无 escape 节点（`\\*` 溶解进 Text，escape ×2 MISS）。
- footnote 定义体内 paragraph 结构与 Lezer 解释不同（记录性 SPUR）；definition 行内 `[^1]` 在 footnote 开启时不解释为 link（解释差异 MISS）。
- **亮点：唯一原生支持 frontmatter 的候选**（`constructs.frontmatter` → Node::Yaml，[0,64) MATCH），且 table cell 内文、引用链接 `[text][ref]` 等全部 MATCH。

**pulldown-cmark**
- **0.13 事件 range 语义：Start/End 事件 range 覆盖整个元素（含块级尾随 `\n`），完全不暴露定界符 span**（用 `examples/events.rs` 探针逐事件验证）→ marker 缺失 33 处；块级 span 尾随 `\n` 造成 57 处 CONVENTION。
- 唯一例外：`TaskListMarker` 事件带 `[x]` span → taskCheckbox 可精确重建。
- tight list item 内**不产生 Paragraph 事件**（7 MISS）——list item 无内容级结构。
- **link reference definition（`[ref]: url`）不产生任何事件**（真实缺口：投影无法定位/样式化引用定义）。
- 无 escape 事件；无 frontmatter（与 Lezer 同样的 setext 误判）。
- table cell span 含 pipe/空格，内文需从子事件推导（已按统一规则推导后 MATCH）。

**comrak**
- 无 delimiter 节点 → marker 缺失 33 处；但 **`NodeTaskItem.symbol_sourcepos` 原生给出 checkbox 符号位置**（向两侧扩 1 byte 即 `[ ]`/`[x]`，taskCheckbox 精确 MATCH）。
- sourcepos 为 1-based 行/列，**列是 byte 列，且 end column 指向最后一个字节**（探针实测），需换算；换算后全 fixture MATCH。
- `HtmlInline` 有 sourcepos（`<span>`/`</span>` MATCH）；`HtmlBlock.literal` 可判 `<!--` → htmlComment 区分 ✓。
- **link reference definition 无节点**（MISS，同 pulldown）。
- **escape 溶解进 Text 且 Text sourcepos 不含反斜杠**（`an escaped \* star` 的 Text span 短于原文）——escape 邻域的叶级 span 不可直接信任（块级 span 不受影响）。
- footnote：FootnoteReference/FootnoteDefinition 均有精确 sourcepos ✓。

### 3.2 markerRanges 支持程度（P4B marker cohort 的决定性判据）

| 候选 | 定界符级 marker spans | 依据 |
| --- | --- | --- |
| **Lezer** | **✅ 全部原生提供**：HeaderMark / EmphasisMark / CodeMark / QuoteMark / ListMark / LinkMark / StrikethroughMark / TaskMarker / TableDelimiter 都是语法树子节点，span 精确（round-trip marker 全数 MATCH） | 语法树 delimiter 子节点 |
| markdown-rs | ❌ 完全没有（mdast position-only） | — |
| pulldown-cmark | ❌ 没有（0.13 Start/End range = 整个元素；仅 TaskListMarker 例外） | examples/events.rs 探针 |
| comrak | ❌ 基本没有（仅 TaskItem.symbol_sourcepos 可重建 checkbox span） | — |

结论：**四个候选中只有 Lezer 能提供 P4B marker cohort（hidden-marker/弱化显示）所需的定界符级 ranges**。

## 4. 性能粗测（spike 级，单机 3 次取中位数，非 design/05 §6 冻结 SLO 基准）

> **数字来源（可追溯）**：本表全部数字取自归档 evidence run `20260829-035314-p4a-f189b0c` 的
> `validation/evidence/P4A/20260829-035314-p4a-f189b0c/perf-ts.json`（Lezer，generatedAt 2026-08-28T19:54:23Z）
> 与 `perf-rust.json`（markdown-rs/pulldown-cmark/comrak）。每格 = 对应 JSON 的 `median` 字段，样本数组见原文件。
> 开发期迭代运行（输出目录 `spike/parser-spike/out/`，已清理）与归档值存在单次波动（如 direct 1MB 48.0 vs 归档 49.5），以归档值为准。

同一组合成 fixture（mulberry32 seed 42，与 canonical 生成器同构；TS/Rust 读相同文件，SHA-256 记录于归档 perf-ts.json）：

| 候选 | 1MB 单巨段 | 10MB 单巨段 | 1MB 分块 | 10MB 分块 |
| --- | --- | --- | --- | --- |
| Lezer 直接 parse | 49.5ms | 510.8ms | 70.8ms | 646.5ms |
| Lezer 经 CM ensureSyntaxTree（全量） | 48.1ms | 494.0ms | 64.4ms | 643.1ms |
| Lezer **viewport 增量**（ensureSyntaxTree 至 5000 u16） | 47.5ms（被迫全量，见下） | 507.6ms（同左） | **0.35ms**（解析至 5035 即停） | **0.44ms**（同左） |
| markdown-rs to_mdast | 238.4ms | 20 487.6ms | 623.3ms | 58 111.8ms |
| pulldown-cmark | 2.1ms | 23.6ms | 4.1ms | 44.7ms |
| comrak | 9.7ms | 125.2ms | 11.1ms | 131.9ms |

（注：单巨段 fixture 的 Lezer viewport 行取自归档 `cmViewportParseGiantParagraphMs`；分块 fixture 的 viewport
行取自 `cmViewportParseMs` —— 在内存中同尺寸分块文档上测量，parsedTo=5035 即停。）

关键读数：
- **Lezer viewport 增量是数量级优势**：分块文档上首屏树就绪 0.35–0.44ms vs 全量 494–643ms（约 3 个数量级）。
- **增量粒度 = block**：单词沙拉 fixture（全文一个无空行巨段落）无法提前停止——viewport 请求也要解析整段（归档 47.5/507.6ms，parsedTo=全文）。真实文档有 block 边界时增量有效；**极端长段落是所有候选的最坏情况**。
- **markdown-rs 在 10MB 上不可用**（20.5–58.1s，比 pulldown 慢 3 个数量级；为 spike 实测值，含 mdast 树构建）。
- pulldown-cmark 全量解析最快（10MB 23.6–44.7ms）；comrak 次之（125.2–131.9ms）；Lezer 全量与 comrak 同量级。
- 内存/IPC payload 未测量（spike 级留待 6.7 benchmark）。定性：Lezer 在进程内、无 IPC；Rust 候选作为 Core IR 需经 IPC 传 ranges（O(构造数) 小元组），且任何编辑都要整段重解析（无增量协议）。

## 5. Malformed / unknown fallback

`malformed` fixture（未闭合 ``` fence 在文件头，吞掉后续一切）+ 全部 Unicode/EOL 边界 fixture 上：**四个候选都无 throw、无 panic**（Rust 侧 catch_unwind 全程未触发）。fallback 结构：

- Lezer / markdown-rs / pulldown-cmark / comrak：未闭合 fence 作为一个 FencedCode 覆盖到文档末尾（Lezer [0,97)、其余同构）——「安全的吞噬」而非崩溃；投影侧表现为大段源码态，可接受。
- 前端 try/catch（Lezer）与 Rust Result + catch_unwind 双层兜底使 parser 异常不可能影响编辑/保存（与 P3 的 projection failure 注入合同一致）。

## 6. 许可 / 维护 / 供应链

| 候选 | License | 版本与发布节奏 | 维护/生态 | 供应链面 |
| --- | --- | --- | --- | --- |
| @lezer/markdown | MIT | 1.7.2（2026-07-15）；2026-07 内连发 1.7.0–1.7.2 | 活跃；单一维护者（CodeMirror 作者 marijn），CodeMirror 生态核心 | **已在产品内**，零新增依赖；repo 在 code.haverbeke.berlin（自托管 GitLab） |
| @codemirror/lang-markdown | MIT | 6.5.2（2026-08-04）；2025-10–2026-08 连续发版 | 同上 | 同上（产品已依赖） |
| markdown（markdown-rs） | MIT | 1.0.0（2025-04-23）；1.0 后发布节奏放缓 | 活跃上游（unified/mdast 生态作者 wooorm）；crates.io 9.4M 下载 | 必选依赖≈0（serde/log/unicode-id 均 optional），纯实现；若引入为新依赖 |
| pulldown-cmark | MIT | 0.13.4（2026-05-20）；0.13.x 2026 年持续维护 | 非常活跃；crates.io 142M 下载，Rust markdown 事实标准之一 | 必选依赖：bitflags 2 / memchr 2.5 / pulldown-cmark-escape 0.11 / unicase（getopts/serde optional） |
| comrak | BSD-2-Clause | 0.54.0（2026-07-12）；0.53/0.54 均在 2026-07 | 非常活跃；crates.io 7.2M 下载 | 依赖面最宽：bon / caseless / emojis / finl_unicode 等一组合计 8+ 必选依赖 |

数据来源：`npm view`（license/version/time/maintainers/repository）与 crates.io API（`/api/v1/crates/<name>`、`/versions`），采集时间 2026-08-29，原始输出存 evidence `license.md`。

## 7. 初步 qualify / disqualify 结论

| 候选 | 初步结论 | 依据（§编号） |
| --- | --- | --- |
| **Lezer (+GFM)** | **QUALIFY**（作为本地投影/Core IR 的 range 来源） | 0 INVALID、87/88 MATCH；唯一原生 markerRanges；UTF-16 原生坐标零转换；viewport 增量 0.3–0.8ms；产品已内嵌零供应链新增。缺口：无 frontmatter（**误判为 setext heading，必须前置剥离**）、无 footnote 定义结构、malformed 大段 fence 吞噬属可接受 fallback |
| **comrak** | DISQUALIFY（marker cohort owner 角度） | range 精度本身全绿（83 MATCH/0 INVALID，唯一能直接给 checkbox span），但无定界符 marker spans；linkRefDef 无节点；escape 邻域叶级 span 不可信；行列坐标需换算；依赖面最宽 |
| **pulldown-cmark** | DISQUALIFY（marker cohort owner 角度） | 全量解析最快且 range 可信，但 0.13 完全无定界符 spans、tight list 无段落结构、linkRefDef 无事件——无法承载 marker reveal/弱化 |
| **markdown-rs** | DISQUALIFY | 10MB 解析 20–58s（超出任何可用预算）；无 marker spans；TableRow 无 isHeader；无 checkbox span。frontmatter 原生支持是唯一亮点，不足以挽回 |
| draft ParseIndex | EXCLUDED | 运行时不可达（Tauri=Rust+TS 无 JVM；draft-js 内部 API 非公开），无法纳入统一比较 |

### 对任务 6.3 ADR 的输入（非决定）

- 若 P4B marker cohorts 需要定界符级 markerRanges（design/05 §4 widget protocol 明确要求 markerRanges），则**当前证据下只有 Lezer 满足**；Core IR 若引入 Rust parser 只能承担块级结构（table/frontmatter/footnote 定位），marker 仍须来自本地 Lezer 树。
- Lezer 的 frontmatter 误判是唯一「错误结构」风险，可用与 P3 相同的 frontmatter 剥离前置消除（spike 证据：剥离后即为普通 heading/body，全部 MATCH）。
- 无任何候选在 malformed/Unicode/EOL 边界上 panic 或产生错误 range；「没有合格胜者」情形本次未触发——但**是否引入 Core IR（复杂度/IPC/双 owner 成本 vs 收益）是 6.3 ADR 的独立决定**，本报告不预设。

## 8. 复现方式

以下命令均在**仓库根**执行（evidence run `20260829-035314-p4a-f189b0c` 的 C03b 行已按此形式验证 exit 0）：

```bash
# 合成 perf fixture（确定性，先于下面两步生成；写 $(os.tmpdir())/markflow-p4a-spike/）
node spike/parser-spike/explore/gen-perf-fixtures.mjs

# TS 侧（Lezer）range 报告 + 性能（SPIKE_OUT 可写报告到指定目录）
SPIKE_OUT=<evidence-dir> npx vitest run --config vitest.spike.config.ts

# Rust 侧（--manifest-path + 仓库根相对路径；不要进入 spike crate 目录运行）
cargo run --release --manifest-path spike/parser-spike-rust/Cargo.toml --quiet -- \
  --fixtures-dir tests/fixtures/byte-contract \
  --extra-fixture spike/parser-spike/extra-fixtures/spike-extra-task-inline.md \
  --expectations spike/parser-spike/expectations.json \
  --out <evidence-dir> \
  --perf-dir "$(node -p 'require("os").tmpdir()')/markflow-p4a-spike"
```

报告 JSON：`report-ts.json` / `perf-ts.json` / `report-rust.json` / `perf-rust.json`（路径见 evidence run RUN.md 索引）。
