# Spec Delta

## MODIFIED Requirements

### Requirement: README 内容准确性
README 中的功能描述 SHALL 与当前产品行为一致。

README 的许可证段落 SHALL 与根目录 `LICENSE` 文件一致，并指向该文件。README SHALL 提供隐私说明与第三方许可证声明的入口。

#### Scenario: 功能特性验证
- **WHEN** 对比 README 功能列表与 openspec/specs/product-spec.md 的 P0 功能清单
- **THEN** 所有 P0 功能在 README 中均有对应条目

#### Scenario: 许可证段落与 LICENSE 一致
- **WHEN** 用户阅读 README 的许可证段落
- **THEN** 段落声明的许可证类型与根目录 `LICENSE` 相同
- **THEN** 段落包含指向根目录 `LICENSE` 的链接

#### Scenario: README 提供隐私与第三方声明入口
- **WHEN** 用户阅读 README
- **THEN** 中英文 README SHALL 均包含指向隐私说明文档的入口
- **THEN** 中英文 README SHALL 均包含指向第三方许可证清单的入口
