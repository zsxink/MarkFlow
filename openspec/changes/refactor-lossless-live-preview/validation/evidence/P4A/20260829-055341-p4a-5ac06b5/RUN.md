# Validation Run Record — P4A task 6.2 parser range→source property tests

状态：AI GATE COMPLETE（待独立 Reviewer / 人工验收 / Program decision）

## Identity

| 字段 | 值 |
| --- | --- |
| Phase | P4A（refactor-lossless-live-preview，任务 6.2） |
| Run ID | `20260829-055341-p4a-5ac06b5` |
| Date/time | 2026-08-29 05:52 – 05:54 +0800（命令执行窗口） |
| Agent/operator | 实现 AI（ZCode agent，P4A 任务 6.2 指派） |
| Repository root | `/Users/xian/Project/book/MarkFlow`（`git rev-parse --show-toplevel` 实测） |
| Branch | `test/issue-255-lossless-byte-contract` |
| Commit SHA | `5ac06b523dc1ca1498aaf5c01566ab6aab9c3c7e`（HEAD 短 SHA `5ac06b5`，即 6.1 spike 提交；6.2 产物 uncommitted，由调度器复核后统一提交） |
| Dirty status | DIRTY：(a) 本任务 6.2 产物（新增 `spike/parser-spike/property.test.ts`、`spike/parser-spike/lib/property-spec.mjs`、`spike/parser-spike/PROPERTY-REPORT.md`、`spike/parser-spike-rust/src/property.rs`、`spike/parser-spike-rust/src/lib.rs`、`spike/parser-spike-rust/examples/deep_nest_probe.rs`（Reviewer P2-1 复核后入档）、`spike/parser-spike/.gitignore`（Reviewer P2-6：忽略开发期 `out/` 输出）；修改 `spike/parser-spike/lib/lezer.ts`、`spike/parser-spike-rust/src/main.rs`）为 uncommitted；(b) 工作树另有 6 个既有产品文件修改（`src-tauri/src/lossless/guarded_write.rs`、`src/components/sidebar.conflict.ts`、`src/components/sidebar.fileops.ts`、`src/components/sidebar.fileops.test.ts`、`src/components/sidebar.lossless.conflict.test.ts`、`src/lib/lossless/editorSurfaceBinding.ts`）——本 run 开始前已存在，归属调度器其他工作流，本 run 未读取、未修改任何产品代码 |
| Feature flags | 无产品 flag 涉及（纯离线 parser spike，不触碰 `src/`、`src-tauri/`、`markflow-core/`、根 package.json、tsconfig、vite 配置） |
| Immutable environment snapshot | `./ENVIRONMENT.md` |
| Environment snapshot SHA-256 | `736ab6d11d8f92027c379c78615ecde943cb079b455ae11961047aa27d2b699d` |

## Scope

- Design document: `design/phases/P4A-render-ir.md` §4；判据 `design/05-render-ir-widgets-nfr.md` §1/§6/§7
- Child Issue/change: umbrella change `refactor-lossless-live-preview`，任务 6.2（「对 CJK、emoji、escape、nested、malformed 与随机 boundary 做 range→source slice property tests；任一 lossless/range 失败淘汰候选」；任务 6.1/6.3+ 不在本 run 范围）
- Changed modules: 仅新增/修改 spike 目录与 validation 记录 —— TS：`spike/parser-spike/property.test.ts`（新）、`spike/parser-spike/lib/property-spec.mjs`（新，确定性 SPEC：seed 列表 + mulberry32 + 扰动池 + 已知构造 + 指纹）、`spike/parser-spike/lib/lezer.ts`（改：kind-owned marker 归因过滤，见 `spike/parser-spike/PROPERTY-REPORT.md` §3.1）；Rust：`spike/parser-spike-rust/src/property.rs`（新，`--property` 子命令 + 同一 SPEC 镜像）、`spike/parser-spike-rust/src/lib.rs`（新，lib/bin 拆分）、`spike/parser-spike-rust/src/main.rs`（改：布尔 flag 解析 + `--property` 入口）；汇总 `spike/parser-spike/PROPERTY-REPORT.md`（新）
- Excluded modules: 产品代码全部（`src/`、`src-tauri/`、`markflow-core/`）、`tests/`、`e2e/`、根 package.json、tsconfig、vite 配置 —— 均未改动；默认 `npm test`（include `src/**/*.test.ts`）与 `npx tsc --noEmit` 不受 spike 影响

## Commands

| ID | Command | Start | End | Exit | Status | Output path |
| --- | --- | --- | --- | --- | --- | --- |
| C01 | `npm test` | 05:52:20 | 05:52:37 | 0 | PASS（44 files / 554 tests，默认门禁不受 spike 影响） | `gate-output/C01-npm-test.txt`（计时 `C01-time.txt`） |
| C02 | `npx tsc --noEmit` | 05:52:40 | 05:52:41 | 0 | PASS | `gate-output/C02-tsc-noEmit.txt` |
| C03 | `SPIKE_OUT=<run-dir> npx vitest run --config vitest.spike.config.ts`（6.1 report + 6.2 property + perf，14 tests/3 files 全过；写 `report-ts.json`、`perf-ts.json`、`property-ts.json` 到本目录） | 05:52:41 | 05:52:55 | 0 | PASS（断言：全部 property 类 0 range 失败） | `gate-output/C03-spike-vitest.txt` |
| C04 | `cargo build --release --manifest-path spike/parser-spike-rust/Cargo.toml` | 05:53:11 | 05:53:11（增量） | 0 | PASS | `gate-output/C04-cargo-build.txt` |
| C05 | `cargo run --release --manifest-path spike/parser-spike-rust/Cargo.toml --quiet -- --property --out <run-dir>`（三候选 × P1–P7/PF 全类 + heavy，写 `property-rust.json`） | 05:53:11 | 05:53:30 | 0 | PASS（套件完整运行；**1 条发现记录在案**：markdown-rs P6 timeout，见 Failures 节） | `gate-output/C05-property-rust.txt`（stdout 摘要）、`gate-output/C05-property-rust-stderr.txt`（63 条逐例记录） |
| C06 | `npx openspec validate refactor-lossless-live-preview --strict` | 05:53:40 | 05:53:40 | 0 | PASS（change is valid） | `gate-output/C06-openspec-validate.txt` |

## Fixtures and results

输入 = 确定性生成（固定 seed 列表 `[42,1337,20260829,7,99,12345,5150,8080,314159,271828]` + mulberry32，与 canonical 生成器同构；无用户文档）。TS/Rust 共用 SPEC 的 SHA-256 指纹在两份 JSON 内一致：`74ee61baa5fc2e7e3b498b2a352dc233ef8f989c0b759aadbd72278996ff0996`。

**每候选每类计数**（M=matched/通过，F=range 失败；完整计数见 `property-ts.json`/`property-rust.json` 与 `spike/parser-spike/PROPERTY-REPORT.md` §2）：

| 类（用例数/候选） | Lezer | markdown-rs | pulldown-cmark | comrak |
| --- | --- | --- | --- | --- |
| P1-context（220） | 220M / **0F** | 200M+20miss / **0F** | 200M+20miss / **0F** | 200M+20miss / **0F** |
| P2-nested（7 文档，11 包含对） | 全过 / **0F** | 全过 / **0F** | 全过 / **0F** | 全过 / **0F** |
| P3-malformed（13） | 全过 / **0F** | 全过 / **0F** | 全过 / **0F** | 全过 / **0F** |
| P4-boundary（430：210 安全区+220 任意位） | 398M+31destroyed+1absorbed / **0F** | 567M+49D+2A+22miss / **0F** | 566M+52D+2A+20miss / **0F** | 566M+52D+2A+20miss / **0F** |
| P5-validator（10/9 fuzz + 阴性对照） | 10 判 INVALID+放行 / **0F** | 9+放行 / **0F** | 9+放行 / **0F** | 9+放行 / **0F** |
| P6-heavy（8，budget 5s/例） | 8/8（最慢 1097ms）/ **0F** | **7/8 —— mixed-container-nest-10k TIMEOUT** | 8/8（最慢 771ms）/ **0F** | 8/8（最慢 18ms）/ **0F** |
| P7-eol（3，裸 `\r`） | 全过 / **0F** | 全过 / **0F** | 全过 / **0F** | 全过 / **0F** |
| PF-frontmatter（1） | heading MATCH；4 SPURIOUS 按冻结清单豁免；miss 1（无 frontmatter 节点）/ **0F** | frontmatter+heading 双 MATCH / **0F** | heading MATCH；2 豁免；miss 1 / **0F** | frontmatter+heading 双 MATCH / **0F** |
| **合计 range 失败** | **0** | **1（timeout）** | **0** | **0** |

关键读数：

- **Lezer（唯一 QUALIFY 候选）全部 property 类 0 range 失败**：CJK/emoji(ZWJ/肤色/旗旗)/escape/nested/malformed/随机 boundary/深嵌套/巨 token/裸 CR 全部通过；P4 安全区 210 例 range **精确**等于扰动后源码（UTF-16 坐标回归验证）。
- **markdown-rs 1 条淘汰级发现**：`> - `×10000 混合容器链（40KB）超 5s budget（无 budget 实测 11.1s；默认主线程栈直接 SIGABRT/exit 134 —— `catch_unwind` 不可捕获的栈溢出）。构成淘汰判据中的「挂起/panic」类 range 失败；与 6.1 DISQUALIFY 结论一致。
- miss/none-provided 全部为 6.1 已知能力缺口（escape/linkRefDef/taskCheckbox 节点缺失、mdast 无 marker），按 6.1 约定记录为数据、不算失败。
- PF 未发现任何冻结豁免清单（{heading, hr, link}，6.1 REPORT §3.1）之外的 SPURIOUS。
- P5 证明校验器非恒真：10/9 个人工构造的越界/倒置/NaN/相交 range 全部判 INVALID，合法构造对照放行。

## Desktop workflows

| Workflow | Expected | Actual | Status | Evidence |
| --- | --- | --- | --- | --- |
| （本 run 为离线 parser property 测试，无桌面工作流） | NOT APPLICABLE | NOT APPLICABLE | NOT APPLICABLE | — |

## Failures and retries

| Issue | First run | Retry run | Final state |
| --- | --- | --- | --- |
| markdown-rs mixed-container-nest-10k 超 5s budget（P6） | C05 一次运行记录（无 budget 实测 11.1s；默认主线程栈直接 SIGABRT/exit 134 —— `catch_unwind` 不可捕获的栈溢出；复现探针已入档 `spike/parser-spike-rust/examples/deep_nest_probe.rs`，命令见 `spike/parser-spike/PROPERTY-REPORT.md` §3.2） | 不适用（确定性复现：`case` 为固定构造文档，重跑必现） | RECORDED —— 淘汰级证据，触发 markdown-rs 淘汰判据 |
| 开发期修正（非门禁失败）：TS adapter marker 归因（QuoteMark 误归 listItem）与 Image 定界符实为 LinkMark —— 由 P2/P1 property 发现后修复 `lib/lezer.ts`；TAB 缩进行与 U+200B/U+3000 的合法结构干扰移入规范的「前缀池/非安全区字符池」 | 开发迭代（/tmp 输出） | 修复后 C03 一次通过且 6.1 expectations 全保持 MATCH | RESOLVED（详见 `spike/parser-spike/PROPERTY-REPORT.md` §3.1/§3.5） |

## Data and privacy

- Log redaction checked: PASS —— 报告/日志仅含合成文档的短 slice、range 数值、计数与耗时；无正文大段内容、无 token/凭据
- No user document used: PASS —— 全部输入为固定 seed 确定性合成 + 6.1 canonical/extra fixtures（本轮 property 未直接读 fixture 文件，已知构造 source 串取自冻结 expectations 表）
- No credential/token captured: PASS
- Test workspace isolated: PASS —— Rust spike crate 独立 target/（`git status` 未出现，.gitignore `spike/**/target/` 生效）；开发期 /tmp 输出目录不入档

## AI conclusion

- AI gate: PASS —— 6 条命令全部 exit 0；默认门禁（`npm test` 554 tests、`tsc --noEmit`、openspec strict）全绿；spike 门禁（C03）14 tests 全过；TS/Rust property 指纹一致（SPEC 对齐机器可验证）
- 结论：**Lezer 0 range 失败，维持 QUALIFY**；markdown-rs 触发淘汰判据（timeout/挂起 + 默认栈崩溃）；pulldown-cmark/comrak property 全过但维持 6.1 的 DISQUALIFY（无定界符 marker spans）。淘汰汇总与逐类计数见 `spike/parser-spike/PROPERTY-REPORT.md`
- Go/No-Go recommendation: 建议任务 6.3 ADR 采纳本轮证据——若 P4B marker cohorts 需要定界符级 markerRanges，当前全部证据（6.1 range 对比 + 6.2 property/fuzz）下只有 Lezer 可承载；Core IR 若引入 Rust parser 仅能承担块级结构定位
- Unrun items: 6.3（ADR）、6.4–6.8（Render IR 实现/验证）——本 run 未涉及
- Risks: (1) P6 budget 5s 为本 run 明确声明并有据可查的判据（如任务书示例值），markdown-rs 实测 11.1s 记录在案，未被平均值稀释；(2) property 的 P4「任意位置」类只能判定 survived/absorbed/destroyed/remnant/错位五类，销毁判定依赖构造语义上确可被该字符破坏（安全区类才有精确断言）——该取舍已写入代码注释；(3) Rust 候选 slice 相等采用 6.1 CONVENTION 尾随换行容忍（TS 精确），两侧语义差异已记录

## Independent review

- Reviewer: NOT RECORDED（由调度器按 AGENTS.md 规则派出独立 sub-agent 复核）
- Review status: NOT STARTED
- Review report: 待生成 `REVIEW.md`

## Human acceptance

- Human validator: NOT RECORDED
- Status: NOT STARTED
- Record: —（本任务无桌面人工环节；ADR 审阅属任务 6.3）

## Program decision

- Owner: NOT RECORDED
- Decision: NOT STARTED
- Date: —
- Conditions: 任务 6.2 完成判定需 Reviewer 复核本 run、`spike/parser-spike/PROPERTY-REPORT.md` 与两份 property JSON；P4A 终态（`GO_CORE_IR`/`SPIKE_COMPLETE_NO_CORE_IR`/`NO-GO`）由任务 6.3 ADR 决定
