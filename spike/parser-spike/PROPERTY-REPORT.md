# P4A 任务 6.2 — Range→Source Property 测试报告（spike）

- change：`refactor-lossless-live-preview`（Issue #254 program），Phase P4A，任务 6.2
- 分支：`test/issue-255-lossless-byte-contract` @ `5ac06b5`（spike 文件 uncommitted，由调度器统一提交）
- 日期：2026-08-29
- 性质：**spike 证据报告**。淘汰/保留的最终 ADR 决定属任务 6.3；本报告按任务 6.2 的判据给出候选级 property 结论与淘汰证据。
- 证据 run：`evidence/P4A/20260829-055341-p4a-5ac06b5/`（`property-ts.json` / `property-rust.json` / 全部命令原始输出，由 RUN.md 索引）。
- 上游依赖：建立在任务 6.1 harness 之上（`lib/fixtures.mjs`、`lib/lezer.ts`、`lib/validate.ts`、`expectations.json`；Rust `common.rs`/`validate.rs`/`adapters.rs`）。

## 1. 方法

### 1.1 测试对象与坐标系

与 6.1 一致：评估对象为**逻辑 LF 文本**（源字节解码 UTF-8、剥 BOM、CRLF/CR→LF；EOL 还原归 Core LineEndingMap，design/04，明确 out of scope，仅在 P7 做防御性 bare-`\r` 验证）。所有 range 统一为 **UTF-16 code unit 半开区间 [start,end)**。TS 候选（Lezer）原生 UTF-16 零转换；Rust 候选经 6.1 既有 `CoordMap` 双向映射，任何转换错位都会表现为 slice 不匹配/越界。

### 1.2 Property 类（P4A-render-ir.md §4 + design/05 §1/§6/§7）

| 类 | 内容 | 判定规则 |
| --- | --- | --- |
| P1-context | 已知 construct 源码串（22 个，取自 6.1 冻结 expectations 表 + 手工 taskCheckbox）嵌入随机扰动上下文（10 seed × 22 construct = 220 例/候选；扰动池：CJK/emoji(含 ZWJ、肤色、旗旗)/组合变音/零宽/全角空格/制表符/多余空行/不完整定界符 `**` `` ` `` `_`/转义/HTML 注释/链接引用定义） | 同 kind 构造的 sourceRange slice **逐实例等于**已知源码（TS 精确；Rust 按 6.1 CONVENTION 规则容忍尾随换行）；有 marker 期望时 markerRanges slice 多重集相等 |
| P2-nested | 7 个固定嵌套文档（引用>列表>fence、`***`三重、link>strong>emphasis、>>>、strong>inlineCode、list>quote>list、quote>fence） | 同 kind 构造禁止部分重叠；文档化 parent>child 对 child.sourceRange ⊆ parent.sourceRange；全部 range 满足不变量 |
| P3-malformed | 13 个畸形文档（未闭合 fence/emphasis/link/HTML 注释/inline code、非法表格、截断 frontmatter、`***` 孤行、乱序定界 `]text[`、quote 内未闭合 fence） | 不 throw/不 panic；全部报告 range 在界内且满足不变量（0 ≤ from ≤ to ≤ len；content ⊆ source；marker ⊆ source；包裹型 marker 与 content 不相交） |
| P4-boundary | 已知 construct 源码内部/边界随机插入非定界字符（中/😀/U+0301/U+200B/U+3000）：安全区插入（结构不可能变，210 例/候选）+ 任意位置插入（220 例/候选） | 安全区：构造必须存活且 range **精确**等于扰动后文本的期望区间，否则 MISPLACED（失败）；任意位置：survived / 合法吸收（unclosed fence 吞噬）/ 合法销毁 / 残余重构（如 `![alt](x` → 简写图 `![alt]`）均记录；lone surrogate slice = 坐标漂移 = INVALID |
| P5-validator | 把 6.1 校验器喂入人工构造的越界/倒置/NaN/content-marke 越权/相交 range（TS 10 例含 NaN；Rust 9 例 usize 域）+ 合法构造阴性对照 | 每个用例必须判 INVALID；合法构造必须放行（防“校验器恒真”） |
| P6-heavy | 10k 层混合容器链（`> - `×10000 单行）、10k 引用链、1k 缩进列表链、5MB 单词、~5MB 无换行段落、1e5 连续 `*`/`` ` ``/`#` | 有界时间终止（单例 5s budget，断言）；不 panic；Lezer 树覆盖全文；报告 range 全部在界内；记录实际耗时 |
| P7-eol | 裸 `\r`（不成对）/CRLF 混合 3 例 | 不 panic、不越界（行为记录；EOL 还原属 Core 职责，**out of scope**） |
| PF-frontmatter | canonical frontmatter（6.1 期望表 source）+ 已知正文 heading | 6.1 已知 SPURIOUS（Lezer/pulldown 把 frontmatter 误判为 setext/hr/link）**冻结豁免清单 = {heading, hr, link}** 且仅限 frontmatter span 内（依据 6.1 REPORT §3.1）；豁免范围外的任何 SPURIOUS = 新发现；原生支持 frontmatter 的候选（markdown-rs/comrak）必须 slice 相等；Lezer 无 frontmatter 节点 = 6.1 MISS |

### 1.3 确定性与 TS/Rust 对齐

- 固定 seed 列表 `[42, 1337, 20260829, 7, 99, 12345, 5150, 8080, 314159, 271828]`；mulberry32 PRNG 与 canonical fixture 生成器同构；每 case 纯函数派生 seed（`(seed·1000003 + salt + caseIndex) mod 2³²`），无 wall-clock、无 Math.random。
- 扰动池/已知构造/嵌套与畸形文档在 TS（`lib/property-spec.mjs`）与 Rust（`src/property.rs`）逐常量镜像；两侧报告打印 **SPEC_SHA256 指纹**（规范序列化的 SHA-256），本轮实测两侧一致：`sha256:74ee61baa5fc2e7e3b498b2a352dc233ef8f989c0b759aadbd72278996ff0996` —— 指纹不一致即 harness 漂移告警。
- 失败分类沿用 6.1 语义：**INVALID**（越界/倒置/不变量破坏/坐标漂移）、**MISPLACED**（同 kind range 与期望区域重叠但不匹配 —— “解析结果仍指旧位置”类错位）、**MISS / none-provided**（能力缺口，记录不算失败）、**panic**（throw/catch_unwind）、**timeout**（超 budget）。**淘汰判据**：任一候选出现 INVALID / MISPLACED / panic / timeout / 校验器 bypass 即 range 失败，触发淘汰。

## 2. 结果总表（每候选每类）

通过=该类内 matched/正确分类计数；失败列列出非零失败计数。完整 JSON 见 evidence run。

### 2.1 TypeScript 候选 A：CodeMirror Lezer (+GFM)（产品内嵌路径 `markdown({extensions:[GFM]}).language.parser`）

| 类 | 通过 | 失败（INVALID/MISPLACED/marker/panic/timeout/bypass） | 明细 |
| --- | --- | --- | --- |
| P1-context | **220/220 matched**，marker 多重集全匹配 | **0** | 0 miss、0 none-provided（Lezer 全数提供 marker） |
| P2-nested | 11/11 parent>child 包含对成立；0 部分重叠 | **0** | 7 文档全部不变量干净 |
| P3-malformed | 13/13 不 throw、不变量干净 | **0** | |
| P4-boundary | 安全区 210/210 **精确存活**；任意位置 survived 188 + 销毁 31 + 吸收 1 + 残余 0 | **0** | 0 MISPLACED、0 INVALID |
| P5-validator | 10/10 判 INVALID + 阴性对照放行 | **0** | |
| P6-heavy | 8/8 在 5s budget 内终止，树覆盖全文，range 在界内 | **0** | 耗时见 §4 |
| P7-eol | 3/3 不 throw、在界内 | **0** | |
| PF-frontmatter | 正文 heading 精确 MATCH；4 条已知 SPURIOUS 按冻结清单豁免 | **0** | miss 1 = 无 frontmatter 节点（6.1 MISS，非失败） |
| **合计** | | **0 range 失败** | **维持 6.1 QUALIFY** |

### 2.2 Rust 候选 B：markdown-rs 1.0.0（mdast，byte offset → CoordMap）

| 类 | 通过 | 失败 | 明细 |
| --- | --- | --- | --- |
| P1-context | 200/220 matched | **0** | miss 20 = escape ×10 + taskCheckbox ×10（6.1 已知缺口，非 range 失败）；marker none-provided ×120（无定界符信息） |
| P2-nested | 11/11 包含对 | **0** | |
| P3-malformed | 13/13 | **0** | |
| P4-boundary | 安全区全部存活（除缺口类）；survived/absorbed/destroyed 全合法 | **0** | miss 22 = taskCheckbox ×20（安全区无 checkbox 节点）+ linkRefDef ×2（见 §3.4 quirk） |
| P5-validator | 9/9 | **0** | |
| P6-heavy | 7/8 | **1 timeout**（mixed-container-nest-10k 超 5s budget；无 budget 实测 **11.1s**，Lezer 同输入 0.68s/comrak ≈0/pulldown 0.77s） | 另实测：**默认主线程栈上直接 SIGABRT**（深 AST 递归栈溢出，exit 134，catch_unwind 不可捕获） |
| P7-eol | 3/3 | **0** | |
| PF-frontmatter | frontmatter + 正文 heading 双 MATCH | **0** | 原生 frontmatter 支持 |
| **合计** | | **1 range 失败（timeout/挂起 + 默认栈 abort）** | **触发淘汰判据 —— 与 6.1 DISQUALIFY 结论一致** |

### 2.3 Rust 候选 C：pulldown-cmark 0.13.4（byte offset → CoordMap）

| 类 | 通过 | 失败 | 明细 |
| --- | --- | --- | --- |
| P1-context | 200/220 matched | **0** | miss 20 = escape ×10 + linkRefDef ×10（6.1 缺口）；marker none-provided ×120 |
| P2-nested | 11/11 | **0** | |
| P3-malformed | 13/13 | **0** | |
| P4-boundary | 安全区全部存活（除缺口类）；其余全合法 | **0** | miss 20 = linkRefDef 安全区（无该事件，6.1 缺口） |
| P5-validator | 9/9 | **0** | |
| P6-heavy | 8/8（最慢 mixed-container-nest-10k 771ms） | **0** | |
| P7-eol | 3/3 | **0** | |
| PF-frontmatter | 正文 heading MATCH（尾随换行容忍）；2 条已知 SPURIOUS 豁免 | **0** | miss 1 = 无 frontmatter 节点 |
| **合计** | | **0 range 失败** | range 可信；但 6.1 已因无定界符 marker spans DISQUALIFY，6.2 不改变该结论 |

### 2.4 Rust 候选 D：comrak 0.54.0（行列 sourcepos → CoordMap）

| 类 | 通过 | 失败 | 明细 |
| --- | --- | --- | --- |
| P1-context | 200/220 matched | **0** | miss 20 = escape ×10 + linkRefDef ×10（6.1 缺口）；marker none-provided ×120 |
| P2-nested | 11/11 | **0** | |
| P3-malformed | 13/13 | **0** | |
| P4-boundary | 安全区全部存活（除缺口类）；其余全合法 | **0** | miss 20 = linkRefDef 安全区（无节点，6.1 缺口） |
| P5-validator | 9/9 | **0** | |
| P6-heavy | 8/8（最慢 list-indent-nest-1k 18ms） | **0** | |
| P7-eol | 3/3 | **0** | |
| PF-frontmatter | frontmatter + 正文 heading 双 MATCH | **0** | 原生 frontmatter |
| **合计** | | **0 range 失败** | range 可信；但 6.1 已因无定界符 marker spans DISQUALIFY，6.2 不改变该结论 |

## 3. 发现明细（新缺陷/行为差异分类）

### 3.1 Lezer adapter marker 归因缺陷（开发期发现，已修复，属 6.2 的直接产出）

- **现象**：P2 的引用>列表>fence 文档上，Lezer 把 blockquote 续行标记 `> `（fence 行首）作为 ListItem 的**直接子节点**（`QuoteMark [20,21)`），6.1 的无类型 marker 过滤把它误归为 listItem marker → 违反「包裹型 marker 与 content 不相交」不变量，且 Render IR 会把定界符归错构造。
- **修复**：`lib/lezer.ts` 增加 kind-owned marker 过滤（heading→HeaderMark、listItem→ListMark、fence→CodeMark、…）；6.1 冻结 expectations 全部保持 MATCH（本轮 C03 重跑验证）。
- **顺带确认**：Lezer 的 **Image 定界符也是 LinkMark 节点**（`![`/`]`/`(`/`)`），@lezer/markdown 1.7 中不存在 ImageMark 元素（6.1 的 MARKER_NODES 列表是猜测性条目）；映射已更正。

### 3.2 markdown-rs：深嵌套 scalability 悬崖 + 默认栈崩溃（淘汰证据）

- `> - `×10000 混合容器链（40KB 文档）：5s budget **timeout**（淘汰判据中的「挂起」）；512MB 栈 worker 线程无 budget 实测 **11.1s**（30001 constructs，结果本身正确）；**默认主线程栈（8MB）直接 SIGABRT**（深 AST 递归栈溢出，exit 134，`catch_unwind` 不可捕获）——真实进程中该输入会崩溃。
- 复现命令（探针已入档 `spike/parser-spike-rust/examples/deep_nest_probe.rs`，仓库根执行）：
  - `cargo run --release --manifest-path spike/parser-spike-rust/Cargo.toml --example deep_nest_probe -- markdown-rs --big-stack` → 实测 11195ms / 30001 constructs（超 5s budget）；
  - `cargo run --release --manifest-path spike/parser-spike-rust/Cargo.toml --example deep_nest_probe -- markdown-rs` → `fatal runtime error: stack overflow, aborting`（exit 134）。
- 对照：Lezer 677ms / comrak ≈1ms / pulldown 771ms。
- 次要观察：list-indent-nest-1k（1MB 文档）markdown-rs 3.73s，逼近 budget（缩进链近二次复杂度）。
- 与 6.1 性能结论（10MB 20.5–58.1s）方向一致：markdown-rs 的复杂度曲线使其在任何容量等级都不可用。

### 3.3 Lezer/pulldown frontmatter 误判（已知 SPURIOUS，冻结豁免，无新发现）

- PF 类在两个无 frontmatter 节点的候选上共豁免 6 条已知 SPURIOUS（Lezer 4 + pulldown 2），全部位于 frontmatter span 内且属冻结豁免清单 {heading, hr, link}；**未发现任何豁免范围外的新 SPURIOUS**。markdown-rs/comrak 原生 frontmatter 构造 slice 精确 MATCH。

### 3.4 markdown-rs linkRefDef 识别 quirk（记录性 MISS，非 range 失败）

- 20 个 linkRefDef 安全区用例中 2 例（seed 42 o=6、seed 20260829 o=5：非 ASCII 字符紧邻 `]`/`:` 边界，如 `[ref]中: url`、`[ref]:中url`）markdown-rs **未产出 Definition 节点**（把 URL 识别为普通 link）。CommonMark 允许 unicode label —— 记录为 markdown-rs 行为差异/覆盖缺口（MISS），不构成 range 失败；但与 §3.2 叠加后无保留该候选的理由。

### 3.5 规范设计期修正（property 测试自身的诚实性修正，写入冻结 spec）

1. **TAB 缩进行只能出现在前缀池**：tab 行在列表构造之后会合法延续 list item（item 内缩进代码块）——初版规范把 `​\ttab led line` 放进通用池导致 3 个候选一致的「伪 MISPLACED」，逐例核实为合法结构变化后修正规范。
2. **U+200B/U+3000 不得用于安全区插入**：紧跟 opening delimiter 的 Unicode 空白字符合法地破坏 left-flanking（三个 Rust 候选行为一致）——安全区字符池限定为 中/😀/U+0301，U+200B/U+3000 保留在任意位置（销毁合法）类。
3. **残余重构规则**：插入破坏构造后，解析器可能用残余部分形成新的同 kind 构造（`![alt](x` → 简写图 `![alt]`）；其 slice 必为原构造文本的真子串，错位的同长度陈旧 range 不可能成为真子串，故「真子串 ⇒ 合法残余（销毁类）」是可靠判据。

## 4. 耗时表（P6-heavy，单例，evidence run 实测）

| 用例（输入规模） | budget | Lezer | markdown-rs | pulldown-cmark | comrak |
| --- | --- | --- | --- | --- | --- |
| quote-nest-10k（10KB） | 5s | 16ms | 692ms | 82ms | 1ms |
| list-indent-nest-1k（~1MB） | 5s | 1132ms | **3734ms** | 6ms | 18ms |
| single-word-5mb（5MB） | 5s | 305ms | 129ms | 9ms | 16ms |
| no-newline-para-5mb（~5MB） | 5s | 265ms | 227ms | 8ms | 101ms |
| stars-1e5 | 5s | 0.3ms | 2ms | <1ms | <1ms |
| backticks-1e5 | 5s | 0.1ms | 1ms | <1ms | <1ms |
| hashes-1e5 | 5s | 8ms | 2ms | <1ms | <1ms |
| mixed-container-nest-10k（40KB） | 5s | 677ms | **TIMEOUT（实测 11.1s）** | 771ms | <1ms |

TS 侧全套（P1–PF + 8 heavy，220+430+10+8+16 例 + 6.1 report/perf 同 config）总时长 ≈13s，满足 ~2 分钟预算；Rust 侧全套 ≈17s。

## 5. 淘汰判定

| 候选 | 6.2 判定 | 依据 |
| --- | --- | --- |
| **Lezer (+GFM)** | **通过全部 property 类，维持 QUALIFY** | 0 range 失败；唯一原生 markerRanges（6.2 修复归因缺陷后语义更准）；UTF-16 原生坐标经 440 例扰动边界 + 安全区精确断言回归验证；10k 深嵌套/5MB 巨词全部 5s 内 |
| **markdown-rs** | **淘汰（range 失败：timeout/挂起 + 默认栈 SIGABRT）** | §3.2；叠加 6.1 的 10MB 20.5–58.1s 与无 marker spans |
| **pulldown-cmark** | property 全过，**不新增淘汰证据；维持 6.1 DISQUALIFY**（无定界符 marker spans、tight list 无段落结构、linkRefDef 无事件） | §2.3 |
| **comrak** | property 全过，**不新增淘汰证据；维持 6.1 DISQUALIFY**（无定界符 marker spans、escape 邻域叶级 span 不可信） | §2.4 |
| draft ParseIndex | EXCLUDED（6.1：Tauri 无 JVM 运行时，不可比） | — |

**对任务 6.3 ADR 的输入（非决定）**：6.2 未产生任何针对 Lezer 的淘汰级证据；两个 Rust 候选的 range 可信度经 property 验证为真（若 6.3 需要「仅块级结构」的 Core IR 数据源，pulldown/comrak 的 range 层面可用，但 marker cohort 仍只有 Lezer 能承载）。

## 6. 复现方式

以下命令均在**仓库根**执行（evidence run `20260829-055341-p4a-5ac06b5` 的命令表含实测 exit code）：

```bash
# TS 侧（Lezer）：6.1 report + 6.2 property + perf（写 <evidence-dir>/）
SPIKE_OUT=<evidence-dir> npx vitest run --config vitest.spike.config.ts

# Rust 侧：6.2 property 套件（写 <evidence-dir>/property-rust.json）
cargo run --release --manifest-path spike/parser-spike-rust/Cargo.toml --quiet -- \
  --property --out <evidence-dir>
```

退出码语义：TS 侧 vitest 断言全部类 0 range 失败（当前成立）；Rust 侧 `--property` 以「套件完整运行并记录全部证据」为 exit 0 条件（发现计入 JSON/stderr 摘要行），淘汰决定归 PROPERTY-REPORT.md 与 6.3 ADR。
