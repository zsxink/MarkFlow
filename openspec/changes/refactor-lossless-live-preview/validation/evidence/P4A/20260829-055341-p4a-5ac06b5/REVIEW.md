# Independent Review — P4A task 6.2（range→source slice property tests）

- Reviewer：独立 sub-agent（fresh context，非实现流）
- 复核对象：run `20260829-055341-p4a-5ac06b5`（本目录）+ `spike/parser-spike/property.test.ts`、`spike/parser-spike/lib/property-spec.mjs`、`spike/parser-spike/PROPERTY-REPORT.md`、`spike/parser-spike-rust/src/property.rs`/`lib.rs`/`main.rs`、`spike/parser-spike/lib/lezer.ts` 修改
- 复核日期：2026-08-29
- **结论：PASS**（0 个 P0 / 0 个 P1 / 6 个 P2 观察项，均不改变 QUALIFY/DISQUALIFY 结论）

## 1. 复核命令与退出码（reviewer 本机实测，输出在 /tmp/review-62/）

| 检查 | 结果 | Exit |
| --- | --- | --- |
| `npm test` | 44 files / 554 tests 全过 | 0 |
| `npx tsc --noEmit` | 无错误 | 0 |
| `npm run build` | tsc + vite 构建成功 | 0 |
| `npx vitest run --config vitest.spike.config.ts`（第 1 次，SPIKE_OUT=/tmp） | 3 files / 14 tests 全过 | 0 |
| 同上（第 2 次，确定性验证） | 14/14 全过 | 0 |
| `cargo build --release --manifest-path spike/parser-spike-rust/Cargo.toml` | 成功 | 0 |
| `parser-spike-rust --property --out /tmp/...`（第 1 次） | 套件完整运行；1 finding（markdown-rs P6 timeout）记录 | 0 |
| 同上（第 2 次，确定性验证） | 与第 1 次（除计时字段）逐字段一致 | 0 |
| `node tests/byte-contract/generate-fixtures.mjs --verify` | `"changed": []` | 0 |
| `npx openspec validate refactor-lossless-live-preview --strict` | valid | 0 |
| 深嵌套探针（5s budget，512MB 栈 worker） | **TIMEOUT 复现** | 0 |
| 深嵌套探针（无 budget，512MB 栈） | **实测 11172ms**（归档声明 11.1s） | 0 |
| 深嵌套探针（harness `adapters::parse_mdast` 全路径，默认主线程栈） | **stack overflow → SIGABRT，exit 134 复现** | 134 |
| 深嵌套探针（同上，Rust 默认 2MiB 线程栈） | **同样 exit 134 复现** | 134 |

## 2. 重点防作弊检查逐项结论

### 2.1 断言是否恒真 — 通过

- P1 断言比较的是**冻结 SPEC 里的已知源码文本**（`lib/property-spec.mjs` `KNOWN_CONSTRUCTS[].source`）与解析结果的 `doc.slice(sourceRange)` 逐实例相等（property.test.ts `runContextClass`），另断言 markerRanges slice 多重集等于期望定界符。真实比较，非同义反复。
- P4 安全区断言要求 range **起止与文本三重精确等于**扰动后的期望区间（`cf === region[0] && ct === region[1] && slice === perturbed`），陈旧/漂移 range 必然落在 MISPLACED（计为失败）。
- P5 反「校验器恒真」：10（TS，含 NaN）/9（Rust）个人工构造的越界/倒置/相交 range 全部判 INVALID + 合法构造阴性对照放行，两次复跑均通过。
- P4「任意位」类把 survived/absorbed/destroyed/remnant 记为数据，但 absorbed/remnant 均要求与已知文本的严格包含/真子串关系，代码注释对「为何不能掩盖漂移」的论证成立；且无扰动场景由 P1 精确断言兜底。
- 安全区字符池排除 U+200B/U+3000（合法破坏 left-flanking）、扰动池 TAB 行仅限前缀——两处收窄均有明确的结构性理由并写入代码注释与 PROPERTY-REPORT §3.5，属「避免假失败」而非「缩小断言」。

### 2.2 豁免清单 — 通过（未扩大）

- `FRONTMATTER_EXEMPT_KINDS = {heading, hr, link}`，与 6.1 归档 REPORT §3.1 逐条对应（`---`→HR、`# comment line`→ATXHeading、`title:…\n---`→SetextHeading、`[a,b,c]`→Link），且仅限 frontmatter span 内；span 内非清单 kind 记 NEW-SPURIOUS（失败），span 外的 exempt kind 不豁免（heading 仍要求正文 slice 精确相等）。本轮 TS spuriousExempted=4、pulldown=2，与 6.1 归档 SPURIOUS 逐条一致，**无新豁免、无新发现**。

### 2.3 确定性 — 通过

- 代码审计：property 测试与 Rust 套件无 `Date.now`/`Math.random` 影响断言（仅报告 `generatedAt`/耗时字段随机）。
- 实测：TS 两次 spike 全套（含 6.1 report/perf + 6.2 property）结果 JSON **逐字段一致**（剔除 generatedAt/elapsed）；Rust `--property` 两次结果 **逐字段一致**（剔除计时）。markdown-rs P6 timeout=1 两次均复现。
- SPEC 指纹两侧一致：`sha256:74ee61ba…ff0996`（property-ts.json 与 property-rust.json 均打印）。指纹机制真实有效（canonical 序列化 sha256，池/构造/seeds 任一漂移即失配）；注意指纹不覆盖 draw 顺序与 heavy 构造逻辑（见 P2-5）。

### 2.4 markdown-rs timeout / SIGABRT 证据 — 通过（reviewer 独立复现）

- 5s budget timeout：实际套件两次复跑均 TIMEOUT；独立探针同样 TIMEOUT。
- 无 budget 11.1s：独立探针实测 **11172ms**（512MB 栈、同一 `> - `×10000 文档、markdown 1.0.0 同 API），与声明一致。对照：同输入 Lezer ≈682ms、pulldown 771–775ms、comrak <1ms——5s budget 约为最慢通过候选的 6.5 倍，**上限合理、非量身收紧**。
- 默认栈 SIGABRT：用 harness 自身 `adapters::parse_mdast`（walk_mdast + CoordMap 全路径）在默认主线程栈与 Rust 默认 2MiB 线程栈上均复现 **exit 134（stack overflow → abort）**。注意：仅 `to_mdast` + 浅层遍历**不会** abort（reviewer 初版简化探针通过）——abort 由 harness 完整 walk 的更大栈帧触发，声明的「默认栈直接 SIGABRT」对真实 harness 路径成立。
- 证据链缺口（P2-1）：该 SIGABRT 与 11.1s 的原始输出未随 run 归档（探针程序已删除，RUN.md Failures 节如实披露），本次由 reviewer 独立复现补证；建议后续把探针脚本入档。

### 2.5 lezer.ts 修改 — 通过（6.1 结论未被篡改）

- `git diff HEAD -- spike/parser-spike/lib/lezer.ts` 仅含：kind-owned marker 过滤表 + `treeLength` 字段，无其他改动；`expectations.json`、`validate.ts`、`fixtures.mjs` 零改动。
- **重跑 6.1 全套后 report-ts.json 的 lezer 候选与归档 `…f189b0c/report-ts.json` 深度相等（剔除计时字段）**：87 MATCH / 0 INVALID / frontmatter 4 SPURIOUS + 1 expectation-MISS 全部保持。
- 备注（P2-6）：6.1 REPORT §3.1「全部集中在 frontmatter」措辞不准——归档报告中另有一条 malformed fixture 的 fence SPURIOUS（归档与重跑均存在，非 6.2 引入，非 6.2 声明内容）。

### 2.6 Rust 实现质量 — 通过

- `catch_unwind` 覆盖：P1/P2/P3/P4/P7/PF 经 `parse_candidate` 包装；P6 在 512MB 栈 worker 内包装；drop 递归风险通过大栈 worker 规避并预写 report（partial flush）——设计合理。
- comrak 行列→offset：`sourcepos_bytes`（LineTable，行列→byte）→ `construct()` 统一 `map.convert`（**复用 6.1 CoordMap**），未另写坐标实现。
- lib/bin 拆分干净：main.rs diff 仅为 `--property`/`--skip-heavy` flag 与 lib 引用；spike crate 仍未入 workspace、未改产品 Cargo.toml。

### 2.7 范围检查 — 通过

- 6.2 涉及文件 = `spike/parser-spike/{property.test.ts, lib/property-spec.mjs, lib/lezer.ts, PROPERTY-REPORT.md}`、`spike/parser-spike-rust/src/{property.rs, lib.rs, main.rs}`、`validation/phases/P4A.md`、`validation/evidence/P4A/20260829-055341-p4a-5ac06b5/**`——与工作树中另一工作流的 6 个产品文件（`src-tauri/src/lossless/guarded_write.rs`、`src/components/sidebar.*`、`src/lib/lossless/editorSurfaceBinding.ts`）**零交集**；产品代码/根配置在 6.2 范围内零改动（`npm test`/`tsc`/`build` 全绿佐证）。

## 3. 问题清单（P2，均不阻塞）

| # | 级别 | 问题 | 位置/证据 |
| --- | --- | --- | --- |
| P2-1 | P2 | SIGABRT 与无-budget 11.1s 的原始输出未随 run 归档（探针删除）；本次 reviewer 已独立复现（exit 134 / 11172ms），建议归档探针脚本或原始输出 | RUN.md Failures 节；PROPERTY-REPORT §3.2 |
| P2-2 | P2 | 安全区插入导致构造**完全消失**时记为 `miss`（数据）而非 range 失败——分类口径偏宽；本轮 TS P4 miss=0，未影响判定，但属潜在豁免通道 | property.test.ts `runBoundaryClass`（P4 MISS 分支）；property.rs 同 |
| P2-3 | P2 | 多安全区构造只取 `safe[0]` 做安全区断言（table 4 区只用 1、image/link 2 区只用 1），其余区未被 P4 safe 覆盖（P1 精确断言仍覆盖） | property-spec 消费侧 `kc.safe[0]` / `kc.safe.first()` |
| P2-4 | P2 | 文档口径：PROPERTY-REPORT §1.2 称 P4 安全区「210 例/候选」，实际仅 TS 为 210；Rust safe_reps=2（420 安全区 + 220 任意位 = 640 例/候选），属低估而非夸大 | PROPERTY-REPORT §1.2 vs property-rust.json 计数（567+49+2+22=640） |
| P2-5 | P2 | SPEC 指纹不覆盖 NESTED_PAIRS、draw 顺序与 heavy 构造逻辑——两侧这些逻辑漂移不会被指纹告警（本轮逐行比对确认一致） | property-spec.mjs canonicalSpec / property.rs spec_fingerprint |
| P2-6 | P2 | 残留物 `spike/parser-spike/out/property-ts.json`（默认 SPIKE_OUT 的开发期复跑产物，晚于 run 5 分钟）untracked 且未被 .gitignore 覆盖，RUN.md dirty 清单未列——建议提交前清理或加 ignore | `git status`；`git check-ignore` exit 1 |

另记两条 informational（不列问题）：Rust `--property` 携带 finding 仍 exit 0（套件产出证据、淘汰决定归 PROPERTY-REPORT/6.3 ADR，代码与报告均有明示，TS 侧 vitest 断言才是 gate）；Rust P4 safe 断言只检查起点+尾随容忍文本（镜像 6.1 CONVENTION，TS 侧起止全检查）。

## 4. 结论

**PASS**。6.2 交付与声明一致：Lezer 全部 property 类 0 range 失败（维持 QUALIFY）；markdown-rs 的 mixed-container-nest-10k 5s budget timeout（无 budget 11.1s、默认栈 SIGABRT exit 134）经 reviewer 独立复现，构成淘汰级证据；pulldown-cmark/comrak 0 range 失败、维持 6.1 DISQUALIFY；frontmatter 豁免严格限于 6.1 冻结清单与 span；6.1 结论经重跑深度比对确认未被 lezer.ts 修复改动。P2-1～P2-6 建议在 6.3 ADR 前顺手处理（归档探针、清理 out/ 残留、修文档口径），均不阻塞。
