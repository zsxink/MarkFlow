# Tasks

## 1. 测试先行（实现前红）

- [x] 1.1 `src/editor/extensions/__tests__/index.test.ts`：新增 issue #438 describe——缩进命中且保留缩进字节（`正文\n  ---`→`正文\n  \---`、`正文\n   ===`→`正文\n   \===`、`正文\n  --`→`正文\n  \--`、`正文\n  - foo`→`正文\n  \- foo`、`正文\n  1. x`→`正文\n  1\. x`、`正文\n  # x`→`正文\n  \# x`、`正文\n > x`→`正文\n \> x`、`正文\n  <div>`、`正文\n  * * *`→bullet 先行 `正文\n  \* * *`、`正文\n  _ _ _`→空格分隔 HR `正文\n  \_ _ _`）；首行缩进 Setext 不转义（首行 `  --`/`  ===` 原样）；4+ 空格与 tab 不命中（`正文\n    - foo`、`正文\n\t- foo` 原样）；已转义不双转义（`  \- foo`、`  \---` 原样）；全空格行原样（`  `/`   `/`    `）；组合多行逐行命中。验证：红（缩进命中用例失败；4+/tab/已转义/首行 Setext 用例绿——现状即如此）
  - 注记：实现前实测 2 用例红（缩进命中 it 与组合多行 it）、37 绿，与 tasks 预言逐项一致（4+/tab/已转义/首行 Setext/全空格/纯缩进文本用例现状即绿）。另按 design D5 矩阵补了 fence 形态（`  ``` x`→`  \``` x`、`  ~~~`→`  \~~~`）与首行带缩进前缀（`  - foo`→`  \- foo`、`  ---`→`  \---`）断言。
- [x] 1.2 round-trip 用例（`src/__tests__/wysiwyg-markdown-roundtrip.section3.test.ts` §3.10 后新增 §3.11，`breakParagraph` 从编辑器 JSON 驱动）：`正文\n  ---`、`正文\n   ===`、`正文\n  - foo`、`正文\n > 引用` 软换行与两空格硬换行续行真实管线 parse → serialize → re-parse 仍为同一个多行普通段落、re-serialize 字节稳定；authored 磁盘形（roundTrip 驱动）`正文\n  \- foo`、`正文\n  \--` 往返字节稳定；authored `正文\n    - foo`（4 空格懒延续）往返字节稳定且不转义。验证：红（缩进续行用例实现前拆块失败；4 空格 authored 用例绿）
  - 注记：实现前实测 3 用例红（软换行续行、硬换行续行、authored 转义形——authored `正文\n  \- foo` 实现前序列化丢转义为 `正文\n  - foo` 且 re-parse 拆 list）、4 空格/tab 懒延续用例绿，与预言一致。实测序列化拼写与 design D1/D5 预测逐字一致、断言零修订：`正文\n  \---`、`正文\n   \===`、`正文\n  \- foo`、`正文\n  1\. x`、`正文\n  \# x`（本改动规则命中）；`>`/`<`/反引线/`*`/`_` 缩进形态为上游编码形态 `正文\n &gt; 引用`、`正文\n  &lt;div&gt; x`、`正文\n  \`\`\` x`、`正文\n  \* \* \*`、`正文\n  \_ \_ \_`（缩进空格保留在上游编码之前）；硬换行形 `正文  \n  \---`。编辑器内 4 空格/tab 续行重开逐字保留（`正文\n    - foo`、`正文\n\t- foo`）。
- [x] 1.3 admission/reconcile 用例：含 `正文\n  ---` 类续行段落的文档 `decideAdmission` 放行、编辑后 `runSaveBoundary` 不冲突、保存重开仍是普通段落。验证：实现前红
  - 注记：实现前实测红形态——编辑后 `runSaveBoundary` 返回 `conflict`（非 `safe-edit`）；authored `正文\n  \- foo` `verifyAdmission` 返回 `parse-verification-failed`。落点为 #436 加 admission 用例同一文件 `src/editor/__tests__/admission.test.ts`，新增 2 用例：`keeps a typed indented continuation line saveable as one paragraph (#438)`（safe-edit 候选 `正文第一行\n第二行\n  \---`）、`re-admits indented-prefix and lazy-continuation paragraphs as supported (#438)`（`正文\n  \- foo`/`正文\n  \--`/`正文\n    - foo` eligibility+verify 放行，且缩进转义形字节稳定、4 空格懒延续不转义）。

## 2. 实现

- [x] 2.1 `src/editor/extensions/paragraph.ts`：`escapeLineLeadingPrefix` 顶部提取 `/^ {1,3}/` 前导空格捕获，既有九条规则与 Setext 分支的作用对象从整行改为余部（正则与替换串零改动），返回 `indent + escaped`；docstring 增补 #438 语义。验证：1.1 绿
  - 注记：与 design D2 逐字一致，零偏差（`indent`/`body` 提取、九条规则正则与替换串原样保留仅作用对象改 body、Setext 判定 `.test(body)`、`return indent + escaped`）；docstring 增补 #438 段 + 函数体首注释解释懒延续边界。1.1 全部 39 用例绿。
- [x] 2.2 全链路：1.2 / 1.3 绿；`正文\n  ---` 保存候选含 `  \---` 且 re-parse 不升级 H2
  - 注记：round-trip §3.11（4 用例）与 admission（2 用例）全绿；admission safe-edit 候选直接 pin 了 `  \---` 拼写与「仍为普通段落」语义。

## 3. 管线回归

- [x] 3.1 #286/#421/#436 全部用例、§3.8-§3.10、baseline fixtures 零变化。验证：`npm test` 全量绿
  - 注记：`npm test` 全量 106 文件 / 1165 用例绿（#436 归档基线 1153 + 本改动新增 12：单测 6 + round-trip 4 + admission 2），无既有用例修订。

## 4. 全量门禁

- [x] 4.1 `npx tsc --noEmit`、`npm test`、`npm run validate:openspec`、`node scripts/check-layering.mjs` 全部通过；无 dead code、无调试日志
  - 注记：四项全绿——tsc exit 0；`npm test` 106 文件 / 1165 用例；`validate:openspec` 79 passed / 0 failed；`check-layering.mjs` frontend 148 生产文件 + rust 42 生产文件 no violations。改动仅 `src/editor/extensions/paragraph.ts` 与三个测试文件，无新增文件、无 dead code、无调试日志。
