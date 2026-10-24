# Tasks

## 1. 测试先行（实现前红）

- [x] 1.1 新增 `src/editor/extensions/__tests__/math-block.test.ts` tokenizer 规则矩阵：行首/缩进 ≤3/单行/跨行/未闭合/围栏内/行中不命中/空内容不命中。验证：`npx vitest run src/editor/extensions/__tests__/math-block.test.ts` 红（节点未实现）
- [x] 1.2 扩充 `src/__tests__/katex-roundtrip.test.ts`：跨行 align 用例——parse 产出 `mathBlock` 节点且 `latex` 原样（含 `\\`、`&`、缩进）、serialize 字节与输入一致、二次 parse 幂等。验证：红
- [x] 1.3 admission 用例：含跨行公式文档 `decideAdmission` 返回可编辑、`runSaveBoundary` 未编辑判 unchanged。验证：红

## 2. mathBlock 节点

- [x] 2.1 `src/utils/katex-scan.ts` 新增 `scanMathBlockRegions(source)` 纯函数（行首 ≤3 空格 `$$` 到最近闭合 `$$` 的字节区间）+ 单测。验证：绿
- [x] 2.2 新建 `src/editor/extensions/math-block.ts`：节点定义 + `markdownTokenizer` + `parseMarkdown` + `renderMarkdown` 幂等规范形 + `renderHTML`/`renderText` + NodeView（renderKatex 懒渲染、点击编辑 textarea、确认/取消、⌘Enter/Escape）。验证：2.1/1.1/1.2 绿
- [x] 2.3 注册：`src/editor/extensions/index.ts` 导出、`src/editor/init.ts` extensions 列表、`src/editor/markdown/adapter.ts` `MARKFLOW_SERIALIZABLE_TYPES` 加 `mathBlock`、所有测试 harness 构建点（`grep -rn "createAppEditor\|makeEditor" src/**/__tests__/`）注册 MathBlock。验证：`npx tsc --noEmit` 通过、`npm test` 无 unknown-node-type 失败

## 3. eligibility 掩码

- [x] 3.1 `src/editor/markdown/eligibility.ts`：`classifyEligibility` 先消费 `scanMathBlockRegions` 区间，区间内内容不参与 inline-HTML/opaque/fence 判定。验证：`$$\n<div>\n$$`、`$$\n```\n$$`、含 `<!--` 公式的 classify/准入用例绿；纯公式文档 verdict 与现状一致

## 4. 管线回归

- [x] 4.1 fallback/single-block-upgrade：literal `$$` 块（RawMarkdown）编辑后经 `verifySingleBlockUpgrade` 自动升级为 mathBlock；`parseLocalizedMarkdown` 对含公式文档的字面量定位不受影响。验证：扩充 `src/editor/markdown/__tests__/single-block-upgrade.test.ts` 绿
- [x] 4.2 保存边界回归：编辑公式外内容保存后公式字节不变（1.3 转绿）；reconcile 对规范形拼写差异不误报冲突
- [x] 4.3 round-trip 全量回归：§3.8 软换行用例不变、baseline fixtures 通过（`$$ x $$` 规范形差异按既有机制处理）；装饰插件行内/行中公式渲染回归（`src/render/__tests__/katex-render.test.ts`、katex 相关用例不变）
- [x] 4.4 `src/editor/extensions/__tests__/index.test.ts`：escapeParagraphMarkdown 对含 `$$` 行段落不新增转义的回归断言。验证：绿

## 5. 全量门禁

- [x] 5.1 `npx tsc --noEmit`、`npm run build`、`npm test`、`npm run validate:openspec`、`node scripts/check-layering.mjs` 全部通过；无 dead code、无调试日志
