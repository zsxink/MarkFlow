## Context

构建流程 `npm run build`（`tsc && vite build`）因 6 个 TypeScript 错误失败。根因有二：
1. `docx` 包在 `package.json` 中声明但 `node_modules` 中缺失
2. 提交 `0753e26` 新增的测试文件使用了 `prosemirror-markdown` 的 `@internal` 成员（构造函数、`out` 属性），这些成员在发布时被从 `.d.ts` 类型声明中剥离

## Goals / Non-Goals

**Goals:**
- 恢复 `npm run build` 通过
- 修复测试文件中的类型错误，使其与发布的类型声明兼容

**Non-Goals:**
- 不修改 `prosemirror-markdown` 库本身
- 不改变类型系统规范或架构
- 不重构测试逻辑

## Decisions

### 1. 使用 `as any` 断言处理 `@internal` 成员

**选择：** 对 `MarkdownSerializerState` 构造函数和 `out` 属性使用 `as any` 类型断言。

**替代方案：** 
- 自定义 `.d.ts` 补丁声明缺失成员 — 过度工程，维护成本高
- 降级 `prosemirror-markdown` 版本 — 可能引入其他回归

**理由：** 测试文件中使用这些成员是正确的（运行时可用），类型系统限制是库的构建产物。`as any` 断言是最小侵入性的修复方式，明确标记了类型系统的局限。

### 2. 移除未使用的 `schema` 导入

**选择：** 直接从 import 语句中移除 `schema`。

**理由：** `tsconfig.json` 设置了 `noUnusedLocals: true`，未使用的导入是硬错误。

### 3. 使用 `.call()` 修复 `this` 上下文

**选择：** 将 `addStorage!()` 改为 `addStorage!.call({} as any)`。

**理由：** tiptap 的 `NodeConfig` 对 `addStorage` 定义了显式 `this` 参数类型，裸调用时 `this` 为 `undefined`。`.call()` 提供了最小的兼容上下文。

## Risks / Trade-offs

- **`as any` 降低类型安全：** 测试文件中的类型断言绕过了类型检查。但这些成员确实存在于运行时，且测试本身验证的是运行时行为，风险可控。
- **`docx` 依赖安装：** `npm install` 应恢复所有声明的依赖。如果 `package-lock.json` 缺失或过期，可能需要 `npm install` 重新生成。
