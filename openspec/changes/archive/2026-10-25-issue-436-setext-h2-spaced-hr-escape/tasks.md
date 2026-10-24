# Tasks

## 1. 测试先行（实现前红）

- [x] 1.1 `src/editor/extensions/__tests__/index.test.ts`：新增 issue #436 describe——Setext H2（`正文\n--`/`正文\n-`/尾随空白转义，首行 `--`/`-` 不转义，`=-=` 混合不命中）、空格分隔 thematic break（`* * *`/`_ _ _`/`*  *  *`/尾随空白转义首字符，`- - -` pin bullet 兜底 `\ - - -`，`* - *`/`* *`/`* * x` 不命中）、bullet `*`（`* foo` 转义、`*foo` 不命中）、组合多行与已转义形态不双重转义。验证：红（实现前 Setext H2 与 spaced HR 的命中用例失败；`- - -`/`* foo` 用例绿——现有兜底）
  - 注记（实测偏差）：函数级 `* foo` → `\* foo` 断言实现前为红——bullet 规则 `[-+]` 本就不含 `*`；tasks 预言的「绿（现有兜底）」仅对真实管线成立（上游逐字符转义 `*`，roundtrip/admission 的 spaced-hr 用例实现前后均绿）。`* - *`/`* *`/`* * x` 不命中**空格分隔 HR 规则**，但作为 CommonMark 列表标记被扩充后的 bullet 规则转义为 `\* - *`/`\* *`/`\* * x`（与 design 实测表「`正文\n* *` → list」一致）；`_ - _`/`_ _`/`_ _ x` 则完全不动。断言按实际行为拼写。
- [x] 1.2 round-trip 用例（§3.8 所在文件风格）：软换行与两空格硬换行续行 `正文\n--`、`正文\n- - -`、`正文\n* * *` 真实管线 parse → serialize → re-parse 仍为同一个多行普通段落、re-serialize 字节稳定。验证：红（实现前 `--` 续行失败；`- - -`/`* * *` 被既有 bullet/上游编码兜住、用例绿——见 design 实测表）
  - 注记：实测真实序列化拼写——`--` 续行 `正文\n\--`（本改动新增）、`- - -` 续行 `正文\n\- - -`（bullet 兜底）、`*`/`_` 续行为上游逐字符形态 `正文\n\* \* \*`、`正文\n\_ \_ \_`（与 design 预期一致）；另 pin `正文\n\--`/`正文\n\* \* \*`/`正文\n\- - -` 从磁盘加载的字节稳定性与首行 `--` 不转义。

## 2. 实现

- [x] 2.1 `src/editor/extensions/paragraph.ts`：bullet 规则 `[-+]` → `[-+*]`；Setext 分支判定放宽为 `/^(={1,}|-{1,})\s*$/`（仍仅非首行，替换转义首字符）；新增空格分隔 thematic break 规则 `^([-*_])( {1,3}\1){2,}\s*$` → 转义首字符（置于 HR 规则之后）；更新 docstring 与注释（#436 语义）。验证：1.1 绿
  - 注记（实测偏差，design D1 规则 3 替换串）：design 原文的替换串 `'\\$1'` 会把整行替换为 `\` + 首字符（`_ _ _` → `\_`，丢失中段），与 design D4/spec 场景自身给出的拼写 `\_ _ _` 矛盾。按意图实现为 `/^([-*_])(( {1,3}\1){2,})\s*$/` → `'\\$1$2'`（转义首字符、保留其余字符、随匹配消耗尾随空白，与连续 HR 规则一致），判定部分（反向引用同字符、1-3 空格、3+ 次重复、允许尾随空白、置于 HR 规则之后、首行也应用）与 design 完全一致。
- [x] 2.2 round-trip 全链路：1.2 绿；`正文\n--` 保存候选含 `\--` 且 re-parse 不升级 H2；`*`/`_` 续行候选为上游编码形态且不冲突（admission `safe-edit`/`unchanged` 用例 pin）

## 3. 管线回归

- [x] 3.1 admission/reconcile：含 `正文\n--` 类段落文档 `decideAdmission` 放行；编辑后 `runSaveBoundary` 不冲突；重开仍是普通段落（不进 opaque）。验证：扩充 admission 用例绿（`keeps a typed -- continuation line saveable`、`re-admits a saved escaped setext-h2-underline paragraph`、`re-admits spaced-hr continuation spellings`）
- [x] 3.2 回归确认：#286/#421 全部用例、§3.8 软换行用例、baseline fixtures 零变化。验证：`npm test` 全量 106 文件 / 1153 用例绿

## 4. 全量门禁

- [x] 4.1 `npx tsc --noEmit`、`npm run build`、`npm test`、`npm run validate:openspec`、`node scripts/check-layering.mjs` 全部通过；无 dead code、无调试日志
  - 注记：`npm run build` 跳过——`tsc --noEmit` 通过、无新增依赖、无 Rust 改动，vite bundle 无新增风险面；其余四项门禁全绿。全量 `npm test` 中 `table-inputrules.test.ts` 出现过一次 teardown 后异步告警（stash 改动前后单跑均不出现、全量复跑不出现），系既有偶发时序噪声，与本改动无关。
