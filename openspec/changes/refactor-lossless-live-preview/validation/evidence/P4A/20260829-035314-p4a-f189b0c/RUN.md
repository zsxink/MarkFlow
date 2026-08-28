# Validation Run Record — P4A task 6.1 parser candidate range comparison

状态：AI GATE COMPLETE（待独立 Reviewer / 人工验收 / Program decision）

## Identity

| 字段 | 值 |
| --- | --- |
| Phase | P4A（refactor-lossless-live-preview，任务 6.1） |
| Run ID | `20260829-035314-p4a-f189b0c` |
| Date/time | 2026-08-29 03:53 – 04:00 +0800 |
| Agent/operator | 实现 AI（ZCode agent，P4A 任务 6.1 指派） |
| Repository root | `/Users/xian/Project/book/MarkFlow`（`git rev-parse --show-toplevel` 实测） |
| Branch | `test/issue-255-lossless-byte-contract` |
| Commit SHA | `f189b0c95fa7fa4e05186a9e95ecc190c6b521b1`（HEAD 短 SHA `f189b0c`） |
| Dirty status | DIRTY：(a) 本 run 产物 `spike/parser-spike/**`、`spike/parser-spike-rust/**`、`vitest.spike.config.ts` 为 untracked（任务规定不 commit，调度器复核后统一提交）；(b) 工作树另有 6 个既有产品文件修改（`src-tauri/src/lossless/guarded_write.rs`、`src/components/sidebar.conflict.ts`、`src/components/sidebar.fileops.ts`、`src/components/sidebar.fileops.test.ts`、`src/components/sidebar.lossless.conflict.test.ts`、`src/lib/lossless/editorSurfaceBinding.ts`）——本 run 开始前已存在，归属调度器其他工作流，本 spike 未读取、未修改任何产品代码 |
| Feature flags | 无产品 flag 涉及（纯离线 parser spike，不触碰 `src/`、`src-tauri/`、`markflow-core/`、根 package.json dependencies、tsconfig、vite 配置） |
| Immutable environment snapshot | `./ENVIRONMENT.md` |
| Environment snapshot SHA-256 | `22c7c2b5fd6fcc394547c549c7aca2c6d0a49f9aa2aad71a6a9ddfb169451119` |

## Scope

- Design document: `design/phases/P4A-render-ir.md`；判据 `design/05-render-ir-widgets-nfr.md` §1/§6/§7
- Child Issue/change: umbrella change `refactor-lossless-live-preview`，任务 6.1（任务 6.2/6.3 未在本 run 范围）
- Changed modules: 仅新增 spike 目录 —— `spike/parser-spike/`（TS harness：fixtures 加载、Lezer adapter、共享 validator、expectations.json 冻结参考表、report/perf vitest、explore 探针脚本）、`spike/parser-spike-rust/`（独立 Rust crate：markdown-rs / pulldown-cmark / comrak 三候选 adapter + 同一 validator + perf；自带 Cargo.toml，未加入任何 workspace）、根 `vitest.spike.config.ts`（仅 include `spike/**/*.test.ts`）
- Excluded modules: 产品代码全部（`src/`、`src-tauri/`、`markflow-core/`）、`tests/`、`e2e/`、根 package.json、tsconfig、vite 配置 —— 均未改动；默认 `npm test`（include `src/**/*.test.ts`）与 `npx tsc --noEmit`（include `src`）不受 spike 影响

## Commands

| ID | Command | Start | End | Exit | Status | Output path |
| --- | --- | --- | --- | --- | --- | --- |
| C01 | `node tests/byte-contract/generate-fixtures.mjs --verify` | 03:54:09 | 03:54:09 | 0 | PASS | `gate-output/C01-fixtures-verify.txt` |
| C02 | `SPIKE_OUT=<run-dir> npx vitest run --config vitest.spike.config.ts` | 03:54:09 | 03:54:23 | 0 | PASS | `gate-output/C02-spike-vitest.txt`；报告 `report-ts.json`、`perf-ts.json`（本目录） |
| C03 | Rust spike，归档报告 `report-rust.json`/`perf-rust.json` 的原始执行（cwd `spike/parser-spike-rust` + 绝对路径参数；该命令书写形式已按 Reviewer P2-2 废弃，可复现形式见 C03b） | 03:54:31 | 03:58:31 | 0 | PASS | `gate-output/C03-spike-rust.txt`；报告 `report-rust.json`、`perf-rust.json`（本目录） |
| C03b | **可复现命令（Reviewer P2-2 修正后正式验证复跑，仓库根）**：`cargo run --release --manifest-path spike/parser-spike-rust/Cargo.toml --quiet -- --fixtures-dir tests/fixtures/byte-contract --extra-fixture spike/parser-spike/extra-fixtures/spike-extra-task-inline.md --expectations spike/parser-spike/expectations.json --out /tmp/p4a-c03b-verify --perf-dir "$(node -p 'require("os").tmpdir()')/markflow-p4a-spike"` | 04:28:43 | 04:32:45 | 0 | PASS（`[spike] OK: 0 INVALID ranges across all Rust candidates`） | `gate-output/C03b-spike-rust-verify.txt`（验证性复跑报告写 `/tmp/p4a-c03b-verify/`，临时目录不入档；归档 JSON 仍为 C03 原始执行产物） |
| C04 | `npm test` | 03:58:42 | 03:58:55 | 0 | PASS（44 files / 554 tests，默认门禁不受 spike 影响） | `gate-output/C04-npm-test.txt` |
| C05 | `npx tsc --noEmit` | 03:59:10 | 03:59:11 | 0 | PASS | `gate-output/C05-tsc-noEmit.txt` |
| C06 | `npx openspec validate refactor-lossless-live-preview --strict` | 03:59:11 | 03:59:13 | 0 | PASS（change is valid） | `gate-output/C06-openspec-validate.txt` |
| R01 | license/维护/供应链数据采集（`npm view` ×2 包 + crates.io API `/crates/<name>`、`/versions` ×3 crate + 依赖面源码核对） | 03:40 前后 | — | 0 | PASS | `license.md`（含原始输出） |

## Fixtures and byte results

评估对象 = canonical byte fixture 的**逻辑 LF 文本**（源字节解码 UTF-8、剥 BOM、CRLF/CR→LF；EOL 还原归 Core LineEndingMap，不在本 spike 范围）。所有候选 range 统一转换为 UTF-16 code unit 半开区间；坐标探针实测 Lezer=UTF-16、markdown-rs/pulldown=UTF-8 byte、comrak=byte columns（end col 指向最后字节）。

输入 SHA-256 见 `tests/fixtures/byte-contract/manifest.json`（C01 验证 `stable: true`，确定性再生成零漂移）；逻辑文本 SHA-256 完整值在 `report-ts.json` `fixtureBasis.fixtures[]`。下表为 round-trip 判定汇总（M=MATCH，C=CONVENTION 尾随空白约定差，X=MISS 覆盖缺口；全部 26 fixtures × 4 候选 **0 INVALID / 0 content 不匹配 / 0 marker 不匹配 / 0 panic**）：

| Fixture | 逻辑SHA-256(前12) | Lezer | markdown-rs | pulldown-cmark | comrak |
| --- | --- | --- | --- | --- | --- |
| utf8-lf-tail0 | b8ada2a7b0e5 | 2M/0C/0X | 2M/0C/0X | 1M/1C/0X | 2M/0C/0X |
| utf8-lf-tail1 | 52a435d76c69 | 2M/0C/0X | 2M/0C/0X | 0M/2C/0X | 2M/0C/0X |
| utf8-lf-tail2 | bc1b50f45486 | 2M/0C/0X | 2M/0C/0X | 0M/2C/0X | 2M/0C/0X |
| utf8-lf-tail3 | 201dc08c2f7e | 2M/0C/0X | 2M/0C/0X | 0M/2C/0X | 2M/0C/0X |
| utf8-crlf-tail1 | 52a435d76c69 | 2M/0C/0X | 2M/0C/0X | 0M/2C/0X | 2M/0C/0X |
| utf8-crlf-tail2 | bc1b50f45486 | 2M/0C/0X | 2M/0C/0X | 0M/2C/0X | 2M/0C/0X |
| utf8-crlf-tail3 | 201dc08c2f7e | 2M/0C/0X | 2M/0C/0X | 0M/2C/0X | 2M/0C/0X |
| utf8-cr-tail1 | 52a435d76c69 | 2M/0C/0X | 2M/0C/0X | 0M/2C/0X | 2M/0C/0X |
| utf8-mixed-tail2 | ea7b5cceba8e | 2M/0C/0X | 2M/0C/0X | 0M/2C/0X | 2M/0C/0X |
| utf8-bom-lf-tail2 | bc1b50f45486 | 2M/0C/0X | 2M/0C/0X | 0M/2C/0X | 2M/0C/0X |
| empty | e3b0c44298fc | 0M/0C/0X | 0M/0C/0X | 0M/0C/0X | 0M/0C/0X |
| bom-only | e3b0c44298fc | 0M/0C/0X | 0M/0C/0X | 0M/0C/0X | 0M/0C/0X |
| newlines-only | 6a3cf5192354 | 0M/0C/0X | 0M/0C/0X | 0M/0C/0X | 0M/0C/0X |
| spaces-only | 52d8194d6705 | 0M/0C/0X | 0M/0C/0X | 0M/0C/0X | 0M/0C/0X |
| unicode-cjk | d5ccc8920e62 | 2M/0C/0X | 2M/0C/0X | 0M/2C/0X | 2M/0C/0X |
| unicode-emoji | 5466f6833170 | 1M/0C/0X | 1M/0C/0X | 0M/1C/0X | 1M/0C/0X |
| unicode-combining | db3a90e6287f | 1M/0C/0X | 1M/0C/0X | 0M/1C/0X | 1M/0C/0X |
| syntax-lists | b6a683596bc1 | 23M/0C/0X | 19M/4C/0X | 0M/16C/7X | 22M/1C/0X |
| syntax-fence | 5b0b7280306d | 2M/0C/0X | 2M/0C/0X | 2M/0C/0X | 2M/0C/0X |
| syntax-frontmatter | d298cb82a277 | 1M/0C/1X | 2M/0C/0X | 0M/1C/1X | 2M/0C/0X |
| syntax-table-reference-footnote | a0d1b76f9a4d | 14M/0C/0X | 11M/1C/2X | 6M/6C/2X | 12M/0C/2X |
| syntax-html | daa8c887c1bb | 5M/0C/0X | 5M/0C/0X | 2M/3C/0X | 5M/0C/0X |
| syntax-image-blanklines | 1405f11cd7dd | 3M/0C/0X | 3M/0C/0X | 1M/2C/0X | 3M/0C/0X |
| malformed | bad0e9ced2c5 | 0M/0C/0X | 0M/0C/0X | 0M/0C/0X | 0M/0C/0X |
| spike-extra-task-inline | 53516ff4cc6f | 15M/0C/0X | 9M/2C/4X | 7M/6C/2X | 13M/0C/2X |

关键残余差异（逐条归因见 `spike/parser-spike/REPORT.md` §3.1）：

- Lezer 唯一 MISS = frontmatter（无该节点；SPURIOUS 4 条 = `---`→hr、`# comment line`→heading、frontmatter 体→SetextHeading2 误判、`[a, b, c]`→link）。**markerRanges 全数提供（唯一候选）**。
- markdown-rs：表头行不可区分（mdast TableRow 无 isHeader）、无 checkbox span、无 escape 节点、footnote 解释差异；frontmatter 原生支持（唯一 MATCH 候选之一）。
- pulldown-cmark：块级 span 含尾随 `\n`（57 处 CONVENTION）；tight list item 无 Paragraph 事件；linkRefDef 无事件；无 escape 事件；无 frontmatter（同 Lezer 误判）；marker 仅 TaskListMarker。
- comrak：linkRefDef 无节点；escape 溶解进 Text 且叶级 Text span 不含反斜杠；checkbox `symbol_sourcepos` 可精确重建 `[ ]`/`[x]`；frontmatter 原生支持。

## Desktop workflows

| Workflow | Expected | Actual | Status | Evidence |
| --- | --- | --- | --- | --- |
| （本 run 为离线 parser spike，无桌面工作流） | NOT APPLICABLE | NOT APPLICABLE | NOT APPLICABLE | — |

## Failures and retries

| Issue | First run | Retry run | Final state |
| --- | --- | --- | --- |
| harness 开发期修正（非门禁失败）：pulldown 0.13 Start/End 事件 range 覆盖整个元素（非定界符）、comrak end column 指向最后字节、CoordMap u16→byte 末项映射错误——均以探针实测后修正 adapter/映射，最终 C02/C03 一次通过 | 开发迭代（/tmp 输出） | 见 C02/C03 | RESOLVED（0 INVALID） |

## Data and privacy

- Log redaction checked: PASS —— 报告仅含合成 fixture 的短 slice、range 数值、计数与耗时；无正文大段内容、无 token/凭据
- No user document used: PASS —— fixtures 全部来自 canonical 生成器（`tests/byte-contract/generate-fixtures.mjs`）与 spike 确定性合成 fixture（`spike/parser-spike/extra-fixtures/`、`gen-perf-fixtures.mjs`）；`/Users/xian/markflow-test` 未读取未写入
- No credential/token captured: PASS
- Test workspace isolated: PASS —— perf 合成文件写 `<os.tmpdir>/markflow-p4a-spike/`（不 commit）；Rust spike crate 独立目录、独立 target/，未加入任何 workspace

## AI conclusion

- AI gate: PASS —— 6 条命令全部 exit 0；四个候选 × 26 fixtures **0 INVALID**（任何被报告的 range 均可精确回切 canonical 期望源文本）；`npm test`/`tsc --noEmit`/openspec strict 默认门禁全绿，spike 未影响
- Go/No-Go recommendation: 本 run 仅覆盖任务 6.1（候选比较证据），建议进入 6.2（property/fuzz）与 6.3（ADR）。初步候选结论：**Lezer QUALIFY**（唯一提供 markerRanges、UTF-16 原生、viewport 增量 0.3–0.8ms、已内嵌零新增供应链）；comrak/pulldown-cmark range 可信但**无定界符 marker spans**（marker cohort owner 角度 DISQUALIFY）；markdown-rs 10MB 解析 20–58s **DISQUALIFY**；draft ParseIndex EXCLUDED（Tauri 无 JVM 运行时）。完整证据与判据逐条对照见 `spike/parser-spike/REPORT.md`
- Unrun items: 任务 6.2（CJK/emoji/escape/nested/malformed/随机 boundary 的 range→source property tests 与 fuzz）、6.3（ADR）、6.4–6.8（Render IR 实现/验证）——本 run 未涉及
- Risks: (1) 性能数字为单机 spike 级 3 次中位数，非 design/05 §6 冻结 SLO 基准，不得直接用于发布判断；(2) markdown-rs 性能数字含 mdast 全树构建，已如实标注；(3) 期望表由 Lezer 参考推导并经人工对照 fixture 定义冻结——Lezer 的 MATCH 有天然自洽成分，非循环部分为人工核对的 canonical 结构与四个候选的交叉验证；(4) comrak escape 邻域叶级 Text span 不含反斜杠（源码位置不可信）已记录，若复评 comrak 须先解决

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
- Conditions: 任务 6.1 完成判定需 Reviewer 复核本 run 与 `spike/parser-spike/REPORT.md`；P4A 终态（`GO_CORE_IR`/`SPIKE_COMPLETE_NO_CORE_IR`/`NO-GO`）由任务 6.3 ADR 决定
