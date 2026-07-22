## 1. 命令文件创建

- [x] 1.1 创建 `.claude/commands/markflow-issue` 命令文件，包含 YAML frontmatter 和 7 阶段工作流编排说明
- [x] 1.2 实现阶段①：参数验证 + `gh issue view` 拉取 Issue 数据 + 推导 type/branchName/changeName
- [x] 1.3 实现阶段②：前置检查（git status、git pull）+ 创建分支
- [x] 1.4 实现阶段③：`openspec new change` + 按 artifact 依赖顺序依次生成 proposal/specs/design/tasks 的步骤说明（引用现有 opsx:propose skill）
- [x] 1.5 实现阶段④：派遣 sub agent 执行 `openspec instructions apply` 逐步实施 task
- [x] 1.6 实现阶段⑤：派遣 sub agent 执行代码审查 + tsc + build + test，包含失败结果收集
- [x] 1.7 实现修复循环：读取 verify 失败详情 → 派遣 apply agent 修复 → 重新 verify（最多 3 轮）
- [x] 1.8 实现阶段⑥：在主会话中执行 archive 流程（引用现有 opsx:archive skill）
- [x] 1.9 实现阶段⑦：git push + gh pr create + gh pr merge --squash --delete-branch

## 2. 边界情况与防御性检查

- [x] 2.1 非数字参数、工作目录不干净、main 落后远程、分支已存在等异常的处理
- [x] 2.2 `gh auth status` 检查 + push/merge 失败暂停
- [x] 2.3 3 轮修复循环耗尽后的暂停与用户决策引导

## 3. 开发流程文档更新

- [x] 3.1 更新 `openspec/specs/development-flow.md`，在 §4 SDD 开发循环前增加 `/markflow-issue` 快速路径指引
