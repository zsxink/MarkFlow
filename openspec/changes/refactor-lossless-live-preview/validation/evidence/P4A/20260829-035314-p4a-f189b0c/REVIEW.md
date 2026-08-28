# REVIEW — P4A task 6.1 parser candidate range comparison（独立复核）

- Run ID：`20260829-035314-p4a-f189b0c`
- Reviewer：独立 Reviewer sub-agent（fresh context，与实现 AI 无共享上下文；按 AGENTS.md 复核规则与 VALIDATION-PROTOCOL §7 执行）
- 复核日期：2026-08-29
- 复核对象：run 证据目录 + `spike/parser-spike/**` + `spike/parser-spike-rust/**` + `vitest.spike.config.ts` + `validation/phases/P4A.md`（6.1 相关勾选）
- Review commit 基线：分支 `test/issue-255-lossless-byte-contract`（spike 文件 untracked，工作树同时含调度器其他工作流的 6 个产品文件修改——与 6.1 无交集，见检查表 #1）

## 结论：PASS（附 1 项 P1 修正条件）

任务 6.1 的核心交付（统一 fixtures 下的四候选 source/content/marker range round-trip 比较、坐标系统一、malformed fallback、性能/许可记录）全部真实成立并经独立复现：

- **四候选 × 26 fixtures 0 INVALID / 0 content mismatch / 0 marker mismatch 独立复核成立**。我重新实现了 fixture 加载与期望表锚定校验（88 条期望的 `source` 全部是对应 fixture 逻辑 LF 文本的真实子串、markers 均含于 source——期望表锚定在 fixture 文本本身，而非仅 Lezer 输出），并用归档 JSON 逐格核对了 RUN.md 表格与 REPORT.md §3 汇总（Lezer 87M/0C/4SP/0INV/1MISS、markdown-rs 75/7/4/0/6+33 gaps、pulldown 19/57/3/0/12、comrak 83/1/3/0/4，全部吻合）。
- **TS 侧复跑（全新输出到 /tmp）与归档 report-ts.json 汇总逐项一致**；Rust 侧复跑 report-rust.json 三候选汇总与归档逐项一致；expectations.json SHA-256（`74b3c21d…`）与 report-ts.json 记录一致，文件未被事后改动。
- **关键能力声明经探针独立证实**：pulldown-cmark 0.13 `Start/End` 事件 range 覆盖整个元素、无定界符事件（仅 `TaskListMarker` 带 `[x]` span）——我自己重跑 `examples/events.rs` 确认（`Start(Heading)` = 0..8 覆盖 `# Title\n`）；comrak escape 邻域叶级 Text span 与文本长度不一致（`Text("an escaped * star")` 声称 sp=(7,1)-(7,18)）——重跑 `examples/comrak_probe.rs` 确认「叶级 span 不可信」；坐标探针（Lezer=UTF-16、markdown-rs/pulldown=UTF-8 byte、comrak=byte columns 且 end col 指向最后字节）与归档 report JSON 一致。
- 性能结论方向稳健：我的复跑中 markdown-rs 10MB 中位数 20.2–57.9s，pulldown 23–45ms，comrak 123–134ms，与归档数据同量级；「markdown-rs 性能不可用」「Lezer viewport 增量数量级优势」成立。
- 默认门禁不受影响：`npm test`（44 files/554 tests）、`npx tsc --noEmit`、`npm run build` 复跑全绿。

**P1（修正条件，不阻塞本 run 的 AI gate 结论，但必须在任务 6.3 ADR 引用前修正）**：`spike/parser-spike/REPORT.md` §4 性能表的数字与归档 perf JSON 不可追溯（来自开发期另一次运行），见问题清单。其余为 P2。

## 逐项检查表

| # | 检查项 | 结果 | 证据 |
| --- | --- | --- | --- |
| 1 | 6.1 diff 范围合规；未触碰产品代码 | PASS | `git status`：仅 `P4A.md`（M）+ `spike/`、`vitest.spike.config.ts`、`evidence/P4A/`（untracked）。并行工作流的产品改动（`src-tauri/src/lossless/guarded_write.rs`、`src/components/sidebar.{conflict,fileops,fileops.test,lossless.conflict.test}.ts`、`src/lib/lossless/editorSurfaceBinding.ts`）为 run 开始前已存在，6.1 diff 与其无交集（产品 diff 中 grep `spike` 零命中；RUN.md/ENVIRONMENT.md 如实登记了这组文件的存在）；根 package.json / tsconfig / vite 配置零改动 |
| 2 | round-trip 校验真实性（非恒真） | PASS | `lib/validate.ts` / `validate.rs`：bounds 不变量（含包裹型 marker 不与 content 相交）、source 精确比对（尾随空白差单列 CONVENTION）、content（inline 精确/block trim）、marker 多重集比较、MISS/SPURIOUS 记账。TS 侧复跑 87M/0C/4SP/0INV/1MISS 与归档一致 |
| 3 | 期望表无循环论证 | PASS（风险已披露且有界） | 我独立验证 88 条期望 `source` 全部为 fixture 文本真实子串、markers ⊂ source；三个 Rust 候选用完全不同的坐标路径（byte/columns）对同一张表 0 content/marker mismatch，构成交叉验证。REPORT.md §1.3 与 RUN.md Risks(3) 已如实披露 Lezer 参考推导的自洽成分 |
| 4 | 坐标系声明如实 | PASS | Lezer 探针运行时值 headingTo=4=UTF-16 len；markdown-rs/pulldown end offset=6=UTF-8 len；comrak sourcepos (1,1)-(1,6) 为 byte 列且 end col=最后字节。CoordMap 双向映射（含末项 one-past-end 修正）逻辑正确，round-trip 反向验证 |
| 5 | Rust 适配器 range 语义 | PASS | mdast `position.offset`=UTF-8 byte、pulldown `into_offset_iter` Range=byte（Start/End=整个元素，events.rs 实证）、comrak byte columns + `byte_of_end = lineStart+col` 换算与探针一致 |
| 6 | malformed 处理（catch_unwind） | PASS | `main.rs` 逐 fixture 逐候选 `std::panic::catch_unwind`，panic/throw 记录为 finding 不中断；归档与复跑均 0 panic/0 throw（catch_unwind 未触发）；前端 try/catch + Rust Result 双层兜底 |
| 7 | perf 方法与结论 | PASS（结论）/ P1（数字溯源） | 3 次中位数、单机、合成确定性 fixture（SHA 跨 run 一致，复跑证实）；结论（markdown-rs 20–58s 不可用、pulldown 最快、Lezer viewport 0.3–0.8ms、增量粒度=block）被归档 JSON 支持；但 REPORT.md §4 表数字来自开发期 run（见 P1） |
| 8 | REPORT.md 结论 vs 原始 JSON 抽查（>5 项） | PASS（§3 全部核对）/ P1（§4） | §3 四候选 8 项汇总 + RUN.md 26×4 逐格数字全部吻合；§2 版本/许可与 license.md 原始输出一致；§1.2 坐标探针与 JSON 一致；§4 表数字不匹配归档 JSON（P1） |
| 9 | evidence 完整性 | PASS | RUN.md 11 个模板小节齐全（对照 `templates/RUN-RECORD.md`）；ENVIRONMENT.md 为不可变快照，SHA-256 `22c7c2b5…` 实算一致；6 条命令各自独立输出文件；report/perf JSON `generatedAt` 与 C02（03:54:10/03:54:23+08）、C03 时间窗吻合；P4A.md 勾选与 run 路径一致且 tasks.md 6.1 未提前勾选（合规：待 Reviewer/人工/Owner） |
| 10 | 依赖隔离约束 | PASS | 产品 package.json 无 spike 新增（`@lezer/markdown` 为 lang-markdown 传递依赖）；`spike/parser-spike-rust/` 独立 crate（`publish=false`）且仓库无任何 `[workspace]`；默认 `vitest.config.ts` include `src/**`、characterization include `tests/byte-contract/*`、spike config include `spike/**` 三者两两不相交；tsconfig include 仅 `src`，tsc 门禁不触碰 spike |
| 11 | 数据/隐私 | PASS | fixtures 全部 canonical 生成器 + spike 确定性合成；perf 文件在 `<tmpdir>/markflow-p4a-spike/`；`/Users/xian/markflow-test` 未使用；报告仅含合成短 slice/计数/耗时 |

## 复跑命令与退出码

Reviewer 复跑输出全部写入 `/tmp/review-61-*`（不污染 evidence）；Rust 复跑基线为本机全新 release build。

| 复跑命令 | 退出码 | 结果 |
| --- | --- | --- |
| `node tests/byte-contract/generate-fixtures.mjs --verify` | 0 | `verified:true, stable:true, changed:[]` |
| `npx tsc --noEmit` | 0 | 无输出（通过） |
| `SPIKE_OUT=/tmp/review-61-spike npx vitest run --config vitest.spike.config.ts` | 0 | 2 files / 3 tests 全过；复跑 report-ts.json 汇总 87M/0C/4SP/0INV/1MISS = 归档；expectations SHA 一致 |
| `npm test` | 0 | 44 files / 554 tests 全过（与 RUN.md C04 一致） |
| `npm run build` | 0 | 构建成功（chunk>500kB 警告为既有状态，与 spike 无关） |
| `cargo build --release`（spike crate，全新 build） | 0 | 31 条 warning（snake_case 命名等，spike 级） |
| `cargo run --release --manifest-path spike/parser-spike-rust/Cargo.toml -- --fixtures-dir tests/fixtures/byte-contract --extra-fixture spike/parser-spike/extra-fixtures/spike-extra-task-inline.md --expectations spike/parser-spike/expectations.json --out /tmp/review-61-rust --perf-dir <tmpdir>/markflow-p4a-spike`（cwd=仓库根） | 0 | `[spike] OK: 0 INVALID ranges across all Rust candidates`；三候选汇总与归档逐项一致；复跑 perf 量级一致（markdown-rs 10MB 20.2–57.9s） |
| `cargo run --release --example events` / `--example comrak_probe` | 0 | 独立证实 pulldown 无定界符事件、comrak escape 叶级 span 不可信 |
| （ reviewer 脚本）expectations 锚定校验、JSON 汇总抽取、SHA 比对 | 0 | 输出存 `/tmp/review-61-checks/` |

注：按 RUN.md C03 标注的 cwd（`spike/parser-spike-rust`）原样执行会因相对路径解析失败 panic（exit 101）——必须从仓库根执行，见 P2-2。

## 问题清单

### P0

无。

### P1

1. **REPORT.md §4 性能表数字与归档证据不可追溯**（`spike/parser-spike/REPORT.md` §4 vs `perf-ts.json`/`perf-rust.json`）。表载 Lezer direct 1MB=48.0ms / 10MB=512.3ms / cmFull 46.9 / 486.9 / varied 63.1 / 618.0、viewport 0.27 / 0.39ms、markdown-rs 234.1 / 20358.8 / 625.4 / 58159.9、comrak varied-10m 136.9 等，均不等于归档 JSON 的中位数（49.5 / 510.8 / 48.1 / 494.0 / 70.8 / 646.5、0.35 / 0.44ms、238.4 / 20487.6 / 623.3 / 58111.8、131.9），也不是其任何样本；文件 mtime（REPORT.md 03:52 < C02 03:54:10）表明该表取自开发期 /tmp 迭代运行，归档 run 后未刷新，且表未标注数据来源 run。**定性**：所有差异在 run 间噪声内、每个定性结论（markdown-rs 20–58s 不可用、pulldown 最快、comrak 次之、Lezer viewport 0.3–0.8ms、增量粒度=block）都被归档 JSON 支持，属文档溯源缺陷而非证据不实。**要求**：6.3 ADR 引用前，用归档 perf JSON 重生成 §4 表，或在表头显式标注「开发期 run 数据，归档 run 数据见 evidence perf-*.json」。

### P2

1. `spike/parser-spike/lib/lezer.ts` coordinateProbe 注释错误：`utf16Length = probe.length; // 5`、`codePointLength = [...probe].length; // 4`——`'# \u{1F600}'` 实际为 UTF-16=4、code point=3。运行时值与全部报告/JSON 正确，仅注释误导（对拍 main.rs 的 probe note 是对的）。
2. 复现命令 cwd 标注不可复现：RUN.md C03 标注 cwd `spike/parser-spike-rust`，但按此执行相对路径 `tests/fixtures/byte-contract` 不存在（实跑 panic exit 101）；REPORT.md §8「cd spike/parser-spike-rust」同病；`main.rs` docstring「from the spike crate directory or repo root」过度声明。应统一为「仓库根 + `--manifest-path spike/parser-spike-rust/Cargo.toml`」。归档 C03 输出无 cargo `Running/Finished` 行，无法佐证当时实际 cwd。
3. `spike/parser-spike-rust/src/adapters.rs:325` 存在不可达的重复 `Event::Html(_)` 匹配臂（300 行已匹配）；rustc warning 已被如实保存在归档 C03 输出中，但死分支应删除。
4. 双实现微漂移：CONVENTION 尾随空白 trim 集——`validate.ts` 只 trim `[\n ]+`，`validate.rs` 为 `['\n',' ','\t']`（多 trim tab）。当前 fixtures 无尾随 tab 故结果一致，但两份校验器应保持语义逐字对齐。
5. `lib/validate.ts` `RoundTrip` 类型的 `'INVALID'` 值从不被赋值（problems 经 `summary.invalid` 计数）；类型与实现不一致，属死枚举值（Rust 侧同样有 `c.roundTrip == "INVALID"` 死比较）。
6. `spike/parser-spike/lib/lezer.ts` 直接 import `@lezer/markdown`（产品 package.json 未声明，靠 lang-markdown 传递依赖 hoist 解析）。spike 未改动 package.json 故不违规，但若未来启用严格依赖提升，spike 需自行声明依赖（提交 spike 时建议在 spike 目录内加本地 package.json 或在 REPORT 注明）。

## Reviewer 签注

- 本 REVIEW.md 仅新增于本 run 目录，未改动 run 内其他任何文件；复跑输出均在 `/tmp/review-61-*`；复核过程中创建的 `spike/parser-spike-rust/target/` 已删除，工作树恢复至复核前状态（`git status` 与复核前一致）。
- AI gate 结论「PASS（6 命令全绿、0 INVALID）」**维持**。任务 6.1 可判定完成（待 P1 文档修正、人工验收与 Program decision；P1 不涉及任何 range/能力结论的有效性）。
- 建议 6.2/6.3 直接复用本 harness 与 expectations 表（锚定性与跨候选交叉验证已在本 review 独立证实）；6.3 ADR 引用性能数字时以 evidence `perf-*.json` 为准。
