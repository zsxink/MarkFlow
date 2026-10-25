# Tasks

## 1. tokenizer start 有界扫描（根因修复）

- [x] 1.1 `src/editor/extensions/math-block.ts` 的 `markdownTokenizer.start` 改为 64KB 有界扫描：`src.substring(0, 64*1024)` 内 `indexOf('$$')` 逐命中回看行首/≤3 缩进（复刻 `^[ \t]{0,3}\$\$` 语义），窗口内无命中返回 -1；保留 `tokenize` 不变；验证：新增单测覆盖「窗口内命中（含缩进 0/3/4 边界、行中 `$$` 不命中）」「窗口外不命中不误报」，`npm test -- math-block`
- [x] 1.2 `src/editor/markdown/opaque/extension.ts` 的 `markdownTokenizer.start` 同样改为有界 `indexOf(sentinel 前缀)`；验证：新增单测覆盖窗口内/外行为，`npm test -- opaque`
- [x] 1.3 跑通真实管线对照基准（复用 `.tmp/perf-411/frag-1mb.md`，未提交fixture）：注册扩展后的 `markflowMarked.lexer` 1.9MB 碎块耗时应从 25s 级降到亚秒级，记录数据；验证：临时脚本输出 + 数据记入 1.5 的基准注释

## 2. 结构复杂度预算闸门

- [x] 2.1 `src/editor/markdown/eligibility.ts` 增加单遍块级结构计数预扫（O(n) 行扫描，无正则回溯；统计空行分隔块与列表/引用等结构行）与具名预算常量；在 `classifyEligibility` 中体积/行数检查后、返回 eligible 前判定，超预算返回 `{ verdict: 'source-only', reason: 'too-complex', category: 'admission-threshold' }`（新 reason 类型接入 `EligibilityReason` 与 admission 的类型面）
- [x] 2.2 按定档方法实测预算值：用 1.1 修复后的管线跑块数-耗时曲线（~5k/2 万/5 万块生成的 fixture），取 decideAdmission 最坏 ≤2s 的块数向下取整并留安全余量，确定常量值与定档注释；验证：数据表写入任务汇报
- [x] 2.3 `admission.ts` 的 `REASON_LABELS`/`admissionReasonLabel` 增加 too-complex 文案（引用预算数值）；`session.ts`/`mode.ts` 的留源码通知链路自然生效；验证：新增用例断言碎块超预算文档判 source-only 且文案含预算值，`npm test -- eligibility admission`
- [x] 2.4 单测覆盖：预算内碎块文档正常 eligible、恰好等于预算、结构行计数准确性（列表/引用/空行边界）；`npm test -- eligibility`

## 3. onUpdate 序列化防抖化

- [x] 3.1 `src/editor/init.ts` onUpdate：移除同步 `serializeMarkdown`/`normalizeImageMarkdown`，序列化与比较移入 `scheduler.schedule('dirty-check', 400)` 回调；保留同步 `bumpRevision()`；确认 dirty-check 回调内文档切换取消逻辑仍正确；验证：`npm test -- init session`（含既有 dirty 相关用例不回归），新增用例断言 onUpdate 路径不再同步调用序列化
- [x] 3.2 走查保存与模式切换路径对 onUpdate 序列化结果的依赖（bridge 独立调用面），确认无隐式依赖被破坏；验证：grep serializeMarkdown 全部调用点 + `npm test` 相关文件

## 4. 基准固化与临时文件清理

- [x] 4.1 新建 `src/editor/__tests__/large-doc-benchmark.test.ts`：程序化生成 fixture（不依赖 .tmp；10MB 碎块 + 10MB 长文 + 50MB 源码侧），覆盖准入链/parse/serialize/按键路径（WYSIWYG 事务+源码 toString+normalize 防抖后路径）/CM6 状态创建；断言 finite + 数量级 sanity；注释记录本变更前后基线数据与预算定档依据；50MB 用例独立 timeout；修掉临时文件中 `st.update` 笔误（正式文件中不复现）；验证：`npm test -- large-doc-benchmark` 通过且总时长 <3min
- [x] 4.2 删除临时文件 `src/editor/__tests__/perf-411-*.bench.test.ts` 三份；`.tmp/perf-411/` 保留（gitignored）作为数据档案；验证：`ls src/editor/__tests__/ | grep perf-411` 为空

## 5. 全量门禁与 spec

- [x] 5.1 全量门禁通过：`npm test`、`npx tsc --noEmit`、`npm run build`、`node scripts/check-layering.mjs`、`cd src-tauri && cargo fmt --check && cargo clippy -D warnings && cargo test`、`npx openspec validate large-doc-performance --strict`
- [x] 5.2 人工验证清单写入 `.tmp/perf-411/manual-verify.md`（gitignored）：10MB 长文 WYSIWYG 打开/输入/滚动/切源码/保存、5MB 碎块被留源码提示、50MB 源码打开/输入/搜索、数学块与保留片段在正常文档中行为不变的真机确认项
