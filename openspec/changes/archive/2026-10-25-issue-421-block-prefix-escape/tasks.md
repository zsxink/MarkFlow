# Tasks

## 1. 测试先行（实现前红）

- [x] 1.1 `src/editor/extensions/__tests__/index.test.ts`：新增规则矩阵用例（`>` 含 `>foo`、围栏 ```` ``` ````/`~~~`、Setext `===` 续行转义/首行不转义、`<div>`/`<!--`、不命中形态 `a < b`/`==` 非整行/`<3` 数字）。验证：红（实现前 5 个命中用例失败）
- [x] 1.2 round-trip 用例（§3.8 所在文件）：软换行与两空格硬换行续行四类前缀 round-trip 字节无损（转义补回后 re-parse 仍为同一段落）。验证：红（实现前 3 个 `===` 用例失败；`>`/围栏/HTML 续行实测已被上游文本编码中和、用例绿，见 design 偏差记录）

## 2. 实现

- [x] 2.1 `src/editor/extensions/paragraph.ts`：`escapeLineLeadingPrefix(line, isFirstLine)` 增加四条规则（`>` / 围栏首字符 / Setext 整行仅非首行 / `<[a-zA-Z!/]`），既有四条与全行应用语义不变；更新 docstring。验证：1.1 绿
- [x] 2.2 round-trip 全链路：真实 parse → serialize → re-parse 断言（含 `>foo`、`~~~`、首行 `===` 不转义、被转义首行 `\> foo`/`\<div> foo` 保真）。验证：1.2 绿

## 3. 管线回归

- [x] 3.1 admission/reconcile：含 `正文\n> 引用` 类段落文档 `decideAdmission` 放行、编辑后保存候选含 `\>` 转义且不冲突；重开仍是普通段落（不进 opaque）。验证：扩充 admission 用例绿（实测：`>`/HTML 候选走上游 `&gt;`/`&lt;` 实体编码而非 `\>` 反斜杠，保存不冲突且重开 eligible——见偏差记录；`===` 候选含 `\===`）
- [x] 3.2 回归确认：既有四条规则用例、§3.8 软换行用例、baseline fixtures 零变化。验证：`npm test` 相关套件绿

## 4. 全量门禁

- [x] 4.1 `npx tsc --noEmit`、`npm run build`、`npm test`、`npm run validate:openspec`、`node scripts/check-layering.mjs` 全部通过；无 dead code、无调试日志
