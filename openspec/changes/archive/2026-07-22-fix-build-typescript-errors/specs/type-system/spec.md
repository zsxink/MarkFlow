# type-system Delta: 修复构建类型错误

## MODIFIED Requirements

### Requirement: 类型检查通过

系统 SHALL 在重构后保持 `npx tsc --noEmit` 无类型错误，`npm test` 全部通过。对于第三方库中标记为 `@internal` 的成员（其 `.d.ts` 类型声明被剥离），测试文件中使用这些运行时可用的成员时 SHALL 通过类型断言（`as any`）绕过类型检查。

#### Scenario: 编译无错误

- **WHEN** 运行 `npx tsc --noEmit`
- **THEN** 无类型错误输出

#### Scenario: 测试通过

- **WHEN** 运行 `npm test`
- **THEN** 所有测试用例通过

#### Scenario: @internal 成员的测试类型兼容

- **WHEN** 测试代码需要使用第三方库中标记为 `@internal` 的成员（如 `prosemirror-markdown` 的 `MarkdownSerializerState` 构造函数和 `out` 属性）
- **THEN** SHALL 使用 `as any` 类型断言绕过 `.d.ts` 类型限制
- **AND** SHALL 在代码注释中标注原因（`@internal` 成员在运行时可用但类型声明缺失）
