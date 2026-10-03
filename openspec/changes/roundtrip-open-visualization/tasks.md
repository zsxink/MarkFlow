# Tasks

## 1. 修复上游行内代码序列化（根因）

- [x] 1.1 在 `patches/@tiptap+markdown+3.30.5.patch` 中让序列化器先渲染代码文本（`@tiptap/markdown` 已由 main 固定为 3.30.5，无需改动依赖声明）：按内容最长反引号串生成更长围栏、按 CommonMark 施加首尾空格填充、仅移除 `code` mark 以保留外层 mark 包裹；验证 `npx patch-package --version` 与 clean `npm install` 后 `node_modules/@tiptap/markdown` 已应用补丁
- [x] 1.2 新增 `src/lib/editor.markdown.codespan.test.ts`，覆盖 `` `` Ctrl+` `` ``、``` ``a`b`` ```、`` `# ` ``、`` ` leading` ``、`` `  two spaces  ` ``、加粗/链接内代码、快捷表代码；断言语义指纹往返一致（`npm test -- editor.markdown.codespan.test.ts`）
- [x] 1.3 移除 `editor.markdown.fingerprint.ts` 中「行内代码尾随空格不可往返」的旧决策注释，改为代码字符必须精确、不得纳入 `CANONICALIZATIONS`；验证该文件无残留 source-only 决策说明

## 2. 块级字面量回退模块

- [x] 2.1 新增 `RawMarkdown` atom 节点（`markflowRawMarkdown`）与 `containsRawMarkdown`，节点视图支持双击就地编辑、空内容删除、HTML 作为文本呈现；验证节点注册后 `editor.getJSON()` 可含该类型
- [x] 2.2 实现 `parseLocalizedMarkdown`：逐 Marked 块用资格分类器与指纹证明筛选，仅展开可证明无损的块，其余成 raw 块；保留 CRLF（偏移映射）与引用式定义（token 间隙），末尾补 continuation 段落；验证 raw 块逐字节等于原文切片
- [x] 2.3 实现 `serializeLocalizedMarkdown`：随机 nonce 标记隔离 raw 块，按精确位置回填原文并只删除渲染器生成的块分隔换行，`verificationDoc` 用于保存证明；验证标记不落盘（序列化结果不含 `MARKFLOWRAW`）
- [x] 2.4 在 `editor.markdown.adapter.ts` 的 `MARKFLOW_SERIALIZABLE_TYPES` 加入 `markflowRawMarkdown`；验证序列化路径接受该类型

## 3. 准入失败策略改为局部保留

- [x] 3.1 在 `editor.markdown.opaque.integration.ts` 新增 `admitLocalized`：渲染 opaque、载入本地化文档、自证指纹与 opaque 恢复后创建 `localizedFallback` 会话，失败返回 `parse-failed`/`verify-failed`；验证返回 `ok:false` 时不创建会话
- [x] 3.2 改写 `decideAdmission` 失败分支统一走 `admitLocalized`，仅 `too-large` 保持 `source-only`，并更新 `opaque-covered` 原因文案；验证 `editor.admission.test.ts` 中畸形表格与行内代码用例返回 `mode: 'reconcile'`
- [x] 3.3 在 `editor.markdown.types.ts` 为 `MarkdownSession` 增加 `localizedFallback` 标志；验证类型检查通过（`npx tsc --noEmit`）

## 4. 保存边界接入本地化证明

- [x] 4.1 在 `reconcileSave` 中使用本地化序列化证明：`containsRawMarkdown` 时升级会话标志，`localizedFallback` 会话改为对最终候选字节做字面量拼接校验（见 7.1）；验证 `editor.admission-ui.test.ts` 保存用例得到 `safe-edit`
- [x] 4.2 在 `editor.save.reconcile.ts` 对 `localizedFallback` 会话跳过图片 URL 归一化；验证字面量块内图片语法在保存后逐字节不变
- [x] 4.3 保持 `reconcile()` 冲突判定不变（候选 null、源版本过期、opaque 不一致、意外变更、语义不匹配仍为 `conflict`）；验证对应用例仍返回 `conflict`

## 5. 编辑器接线

- [x] 5.1 在 `editor.init.ts` 注册 `RawMarkdown`；测试编辑器同步注册；验证应用启动后 schema 含 `markflowRawMarkdown`
- [x] 5.2 修复 `editor.extensions.ts` 图片序列化回退到 `assetToOriginalMap`；验证图片往返保持 authored 源地址

## 6. 集成验证

- [x] 6.1 `npm test` 全绿（含新增/更新的 codespan、admission、admission-ui、roundtrip section3 用例）
- [x] 6.2 `npx tsc --noEmit` 与 `npm run build` 通过
- [x] 6.3 用真实 `README.en.md` 执行准入并做一次编辑保存，确认进入 WYSIWYG 且保存结果保留含反引号的行内代码内容
- [x] 6.4 `npm run validate:openspec` 通过

## 7. 字面量块分隔换行的保存证明（回归修复）

- [x] 7.1 `serializeLocalizedMarkdown` 回填字面量块时整体丢弃渲染器生成的分隔换行（原文自身以换行结尾时），仅在原文无尾换行时保留一个分隔换行；验证 `raw` 尾随 `\n` 的块保存后重新打开不新增换行
- [x] 7.2 新增 `verifyRawMarkdownSplice`，在 `reconcileSave` 的 `localizedFallback` 分支改用最终候选字节做证明：字面量块必须按文档顺序在行首匹配，且原文以换行结尾时其后不得再有换行；验证候选被污染时返回 `conflict` 而非静默写入
- [x] 7.3 新增 `src/lib/editor.localized-fallback.test.ts`：准入 → 编辑 → 保存 → 用新编辑器重新打开保存字节，断言语义指纹一致且字面量块逐字节不变；验证把 7.1 回退为旧算法后该用例失败（变异被杀）
- [x] 7.4 `npm test` 全绿（742）、`npx tsc --noEmit` 与 `npm run build` 通过
