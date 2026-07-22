## Why

`npm run build` 失败，共 6 个 TypeScript 编译错误，阻断了所有 PR 合入和本地开发。问题来自两个方面：1) `docx` 包声明但未安装；2) 新增测试代码使用了 `prosemirror-markdown` 的 `@internal` 成员，类型声明中被剥离。

## What Changes

- 安装缺失的 `docx` npm 依赖
- 修复 `src/lib/editor.extensions.test.ts` 中的 4 个类型错误：
  - 移除未使用的 `schema` 导入
  - 对 `MarkdownSerializerState` 构造函数使用 `as any` 类型断言
  - 修复 `addStorage` 的 `this` 上下文绑定
  - 对 `state.out` 使用 `as any` 类型断言

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `type-system`: 修复测试文件中因 `@internal` 成员剥离导致的类型错误，不改变类型系统规范本身

## Impact

- **代码文件：** `src/lib/editor.extensions.test.ts`、`package.json`（或 `package-lock.json`）
- **依赖：** `docx` 包需安装到 `node_modules`
- **CI：** `npm run build`（tsc + vite build）将恢复通过
- **关联 Issue：** #165
