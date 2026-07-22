## 1. 序列化器修复

- [x] 1.1 修改 `editor.extensions.ts` 中 `mermaidCodeBlockExtension` 的 `serialize` 方法，将 `state.ensureNewLine()` 替换为 `state.write("\n")`
- [x] 1.2 验证所有其他复用同一 `codeBlock` 扩展的序列化路径不受影响

## 2. 单元测试

- [x] 2.1 为自定义代码块序列化器补充单元测试，覆盖 0、1、多个尾随换行场景
- [x] 2.2 验证 `state.text()` + `state.write()` 对节点内容末尾换行的编码行为

## 3. 回归测试

- [x] 3.1 补充一次 WYSIWYG ↔ Source 模式切换回归测试，覆盖代码块尾随换行保留
- [x] 3.2 运行完整测试套件，确保无退化

## 4. 复核与验证

- [x] 4.1 使用独立的 sub agent 进行代码复核，确认设计决策正确实施
- [x] 4.2 使用独立的 sub agent 进行验证，确认 0、1、多个尾随换行在往返后数量不变

## 5. 归档与 PR

- [x] 5.1 运行 `openspec archive` 归档变更
- [x] 5.2 创建 PR 并合入 main
