# Tasks

## 1. 测试先行：改写 §3.8 与新增 fixture

- [x] 1.1 改写 `src/__tests__/wysiwyg-markdown-roundtrip.section3.test.ts` §3.8：软换行断言改为「first/reparsed 包含带 `soft: true` 的 hardBreak 节点、output 行尾无两空格、裸 `\n` 保留」；新增场景：软硬混合往返拼写不互换（`\n` / `  \n` / `\\\n` 三种并存）、列表项与引用内软换行一致。验证：`npx vitest run src/__tests__/wysiwyg-markdown-roundtrip.section3.test.ts` 新断言红（实现前）
- [x] 1.2 在 `src/__fixtures__/wysiwyg-roundtrip.fixtures.ts` 的 break 类别下新增边界 fixture：软换行在加粗/强调内（`**a\nb**`）、链接文本内、列表项懒延续、多行连续软换行、续行以 `1. ` 开头的段落；更新 `break-soft` 的 `knownV2Differences` 说明。验证：`npx vitest run src/__tests__/wysiwyg-roundtrip-baseline.test.ts` 覆盖新 fixture（实现前允许红）

## 2. 解析与序列化：soft-aware HardBreak

- [x] 2.1 新建 `src/editor/extensions/hard-break.ts`：扩展上游 `HardBreak`，`addAttributes` 增加 `soft`（default `null`，无 parseHTML 来源），`parseMarkdown: (token) => token?.raw === '\n' ? { type: 'hardBreak', attrs: { soft: true } } : { type: 'hardBreak' }`，`renderMarkdown: (node) => node?.attrs?.soft === true ? '\n' : '  \n'`；从 `src/editor/extensions/index.ts` 导出。验证：单测断言软/硬 br token 的 parseMarkdown 输出与两种 renderMarkdown 输出
- [x] 2.2 `src/editor/init.ts`：`markflowMarked` 与 `createMarkdownExtension` 的 `markedOptions` 改 `breaks: true`；`StarterKit.configure` 增加 `hardBreak: false` 并在扩展列表注册新扩展。验证：`npm test` 中 round-trip 相关套件通过、§3.8 新断言转绿
- [x] 2.3 更新所有使用 `createMarkdownExtension` 的测试 harness（section3/adjacent-lists/baseline/admission/reconcile/single-block-upgrade/canonicalization 等 `createAppEditor` 型构建点）：StarterKit 禁用默认 hardBreak、注册新扩展。验证：`npm test` 全量无 hardBreak schema 冲突、无软换行被序列化为 `  \n` 的失败

## 3. 转义与粘贴：逐行转义 + 粘贴规范化

- [x] 3.1 `src/editor/extensions/paragraph.ts`：`escapeParagraphMarkdown` 改为按 `\n` 拆行、每行应用既有四条块级前缀转义规则、重新拼接（规则 regex 不变）；更新函数 docstring。验证：新增单测覆盖 `正文\n1. x`、`正文\n# x`、`正文\n- x`、`正文\n---` 及单行既有用例全部不变（`src/editor/extensions/__tests__/index.test.ts` 扩充）
- [x] 3.2 新增粘贴规范化插件（`transformPasted`）：遍历 pasted slice，将非 `code` mark 的 text 节点内 `\n` 拆为 `hardBreak{soft:true}`，code mark 与 RawMarkdown/Opaque 原子不动；在 `init.ts` 注册。验证：单测模拟粘贴多行纯文本后文档模型含 soft 换行节点且序列化保留 `\n`

## 4. 旁路与导出一致性回归

- [x] 4.1 admission/reconcile/单块升级回归：含软换行文档的 `decideAdmission` 进入可编辑模式、`runSaveBoundary` 对未编辑文档判 `unchanged`（字节不漂移）、`verifySingleBlockUpgrade` 对多行块升级产出 soft 换行节点。验证：扩充 `src/editor/__tests__/admission.test.ts`、`src/editor/markdown/__tests__/single-block-upgrade.test.ts` 用例并通过
- [x] 4.2 局部字面量路径核对：`parseLocalizedMarkdown`（fallback lexer 保持 `breaks: false`）对含软换行文档的字面量定位/升级不受影响。验证：扩充 `src/editor/markdown/__tests__` 下 fallback 相关测试（多行块升级、字面量字节保留）并通过
- [x] 4.3 导出回归：渲染 HTML 中软换行为 `<br>`（docx 路径已处理 `br`）。验证：扩充 `src/export/__tests__/document-export.test.ts` 断言多行段落导出含 `<br>` 且不塌缩为空格

## 5. 全量验证

- [x] 5.1 全量质量门禁：`npx tsc --noEmit`、`npm run build`、`npm test`、`npm run validate:openspec` 全部通过；无新增 dead code、调试日志或未使用导出
