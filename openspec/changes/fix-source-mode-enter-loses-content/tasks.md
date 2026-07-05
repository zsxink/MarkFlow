## 1. 问题复现与根因分析

- [x] 1.1 构造最小复现用例：通过 vitest 集成测试验证 WYSIWYG→Source 序列化完
整性，确认基础场景（段落/列表/引用块/表格/图片）均无截断
- [x] 1.2 全面追踪 `getMarkdown()` 序列化链路：MarkdownSerializer → MarkdownSerializerState → renderContent → render，
确认 `parent.forEach()` 遍历全部子节点
- [x] 1.3 检查 tiptap-markdown 所有扩展的 toMarkdown 规则定义（bulletList/orderedList/listItem/taskItem/blockquote/table/codeBlock 等），确认全部有对应的 serializer
- [x] 1.4 根因确认：`onUpdate` 每次 keystroke 调用 `getMarkdown()` 全文档序列化——主线程阻塞 + 编辑器滞后导致打字时光标跳到尾端。同步性能问题，非序列化截断。

## 2. 核心修复：Markdown 序列化完整性

- [x] 2.1 添加 `extractDocAsFallback()` 兜底函数，为所有节点类型使用 `textContent` 提取
- [ ] 2.2 待修复：真实环境中 Enter 后序列化截断的具体根因（需 1.4 手动测试定位）
- [ ] 2.3 待修复：真实环境中引用块内 Enter 截断（需 1.4 手动测试定位）
- [x] 2.4 添加 `extractDocAsFallback()` 作为无显式规则类型的退路（支持 paragraph/heading/list/blockquote/codeBlock/text）
- [x] 2.5 集成测试验证基础 round-trip：ProseMirror → Markdown → ProseMirror 三次循环后内容一致

## 3. 防御性校验：模式切换时内容完整性检查

- [x] 3.1 在 `switchToSource()` 中添加基于 `checkSerializationIntegrity()` 的输出校验
- [x] 3.2 校验失败时：通过 `logException` 记录、通过 `showToast` 通知用户、自动切换到 `extractDocAsFallback()` 兜底
- [x] 3.3 校验通过时：正常执行切换（无额外开销，校验仅需 O(1) 的字符串操作）
- [x] 3.4 阈值控制：将校验逻辑抽取为纯函数 `checkSerializationIntegrity()` 并添加单元测试覆盖假阳性控制

## 4. 测试覆盖

- [x] 4.1 集成测试覆盖：段落/bulletList/orderedList/blockquote/嵌套结构/表格/图片的 Enter+splitListItem 场景
- [x] 4.2 编写 round-trip 保真测试：3 轮 WYSIWYG → setContent 循环验证内容一致性
- [x] 4.3 单元测试覆盖 `checkSerializationIntegrity`：空文档/正常文档/截断/短文档(<5行)/中等内容 五种场景
- [ ] 4.4 手动测试：在真实 Tauri 应用中测试列表/引用块/表格/代码块等场景

## 5. 文档与收尾

- [ ] 5.1 提交信息中记录本次修复内容
- [ ] 5.2 在 `.claude/memory/` 中记录踩坑经验
