## 1. 安装缺失依赖

- [x] 1.1 运行 `npm install` 安装缺失的 `docx` 包及其他依赖
- [x] 1.2 验证 `node_modules/docx` 目录存在

## 2. 修复测试文件类型错误

- [x] 2.1 从 `src/lib/editor.extensions.test.ts` 第 8 行移除未使用的 `schema` 导入
- [x] 2.2 将第 25 行 `new MarkdownSerializerState(...)` 改为 `new (MarkdownSerializerState as any)(...)`
- [x] 2.3 将第 26 行 `addStorage!()` 改为 `addStorage!.call({} as any)`
- [x] 2.4 将第 28 行 `state.out` 改为 `(state as any).out`

## 3. 验证构建通过

- [x] 3.1 运行 `npm run build` 确认 TypeScript 编译无错误
- [x] 3.2 运行 `npm test` 确认测试全部通过
