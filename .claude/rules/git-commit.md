---
description: Git 提交信息规范 — 执行 git commit 时自动加载
globs: [".git/**", "CLAUDE.md"]
---

## 提交格式

```
type: 简明中文描述

closes #N
```

- type 使用英文：`feat`, `fix`, `refactor`, `chore`, `ci`, `docs`, `test`, `perf`, `style`
- 描述使用中文，简洁说明改了什么和为什么
- 多个相关改动用 `+` 连接：`fix: 问题A + 问题B`
- 关联 issue 时在 body 中换行写 `closes #N`（可关联多个：`closes #12, closes #13`）
- 有 PR 号时附在标题末尾：`fix: 描述 (#4)`

## type 选择

| type | 用于 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `refactor` | 重构（不改功能） |
| `chore` | 版本号、依赖、配置等杂务 |
| `ci` | CI/CD 流程 |
| `docs` | 文档 |
| `test` | 测试 |
| `perf` | 性能优化 |
| `style` | 代码格式（不影响逻辑） |

## 分支命名

```
type/#N-简短描述
```

- 示例：`fix/#12-line-number-bug`、`feat/#5-image-export`、`chore/#8-project-memory`
- type 与提交 type 一致
- `#N` 为关联 issue 号
- 描述用英文短横线连接，3-5 个词

## 注意

- 不写英文描述，统一用中文
- 不加 scope 括号（如 `fix(editor):`），直接 `fix:`
- 一行写完，不写 body，除非变更特别复杂
