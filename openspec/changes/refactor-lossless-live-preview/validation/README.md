# MarkFlow Issue #254 项目验证资产

## 1. 用途

本目录属于 `refactor-lossless-live-preview` OpenSpec change，用于保存 AI Coding、独立 Reviewer、人工验收和 Program Go/No-Go 的可版本化流程资产。AI Coding Agent 必须把每个阶段实际执行的命令、退出码、hash、日志索引、截图索引、失败问题和建议写到这里。人工验收人也在对应阶段文档中记录操作结果和签字。

产品行为仍以同一 change 下的 `specs/` 为最高规范；本目录定义验证流程并保存可审查记录。大型日志、视频和二进制 artifact 可以存入 CI artifact，但其 manifest 和结论必须回写本目录。

`/Users/xian/markflow-test` 不属于项目验证资产，只放供人使用 MarkFlow 打开的 Markdown 测试文档。

## 2. 目录结构

```text
openspec/changes/refactor-lossless-live-preview/validation/
├── README.md
├── VALIDATION-PROTOCOL.md
├── ENVIRONMENT.md
├── MANUAL-FIXTURES.md
├── templates/
│   └── RUN-RECORD.md
├── phases/
│   ├── P0.md
│   ├── P0S.md
│   ├── P1A.md
│   ├── P1B.md
│   ├── P2.md
│   ├── P3.md
│   ├── P4A.md
│   ├── P4B.md
│   └── P5.md
├── fixtures/
│   └── README.md
├── evidence/
│   └── README.md
└── issues/
    ├── README.md
    └── ISSUE-TEMPLATE.md
```

## 3. 写入规则

1. 每次验证先创建唯一 `run-id`：`YYYYMMDD-HHMMSS-<phase>-<short-sha>`。
2. 原始输出写入 `evidence/<phase>/<run-id>/`；阶段文档只保存摘要和相对路径。
3. AI 必须更新阶段文档中的 environment、commit、flags、命令结果和结论。
4. 失败不能删除。重跑使用新 run-id，并链接前次失败。
5. issue 写入 `issues/ISSUE-<number>-<slug>.md`。
6. 日志、截图和 fixtures 必须脱敏，不保存 token、Authorization、私人正文或不必要的完整路径。
7. 人工验收只能针对已经完成 AI gate 的同一 commit/flags。
8. `PASS` 只表示该条证据通过；阶段完成还需要 Reviewer、人工和 Program Owner。
9. 每个 run 保存自己的不可变 `ENVIRONMENT.md` 与 SHA-256；根目录环境文件只作当前模板/索引。
10. 人工测试目录的文件名、用途与特殊字节预期维护在 [`MANUAL-FIXTURES.md`](./MANUAL-FIXTURES.md)；run 使用时重新记录实际 hash。
11. Issue #254 使用当前分支和 umbrella change 连续实施；每阶段记录 start/end commit、独立 run、Reviewer、Program Owner 人工验收和 Go/No-Go，不因未创建新 branch/change 而合并证据。

## 4. 状态值

- `NOT STARTED`：未运行；
- `RUNNING`：正在执行，证据尚未封存；
- `PASS`：按记录的 commit/环境通过；
- `FAIL`：存在可复现失败；
- `BLOCKED`：缺环境、权限或前置阶段；
- `WAIVED`：仅非关键项可由 Program Owner 书面豁免；
- `ACCEPTED`：人工验收通过；
- `REJECTED`：人工验收拒绝。

Byte fidelity、错误写盘、安全、跨文档污染和规范 MUST 项不得 `WAIVED`。

## 5. 当前状态

初始详细设计 planning 记录：[`20260812-180222-planning-6bfba453`](./evidence/planning/20260812-180222-planning-6bfba453/RUN.md)。完整复核问题修复与独立回归记录：[`20260812-183047-planning-fix-review`](./evidence/planning/20260812-183047-planning-fix-review/RUN.md)。这些记录只证明规划、规范与验证资产通过，不代表 P0 或任何实现阶段通过。

| 阶段 | AI | Reviewer | 人工 | Program Go |
| --- | --- | --- | --- | --- |
| P0 | CORRECTIVE RUN REQUIRED | historical scope PASS / corrective PENDING | INCOMPLETE | NO-GO |
| P0S | BLOCKED by P0 | NOT STARTED | NOT STARTED | NOT STARTED |
| P1A | BLOCKED by P0 | NOT STARTED | NOT STARTED | NOT STARTED |
| P1B | BLOCKED by P1A | NOT STARTED | NOT STARTED | NOT STARTED |
| P2 | BLOCKED by P1B | NOT STARTED | NOT STARTED | NOT STARTED |
| P3 | BLOCKED by P2 | NOT STARTED | NOT STARTED | NOT STARTED |
| P4A | BLOCKED by P3 | NOT STARTED | NOT STARTED | NOT STARTED |
| P4B | BLOCKED by P4A/construct | NOT STARTED | NOT STARTED | NOT STARTED |
| P5 | BLOCKED by release gates | NOT STARTED | NOT STARTED | NOT STARTED |

P0 Go 后 P0S 与 P1A 可以在当前分支按不重叠模块推进并使用独立 checkpoint；P0S 是任何继续提供 legacy 默认路径的构建的发布/人工使用门禁，P1A 是 P1B 的架构前置。P1B 必须继承 P0S 的零编辑 lifecycle regression，不能把 legacy safety state 当作 Core revision 真相。Program Owner 参与每个阶段的人工验收，直到 P5 完成。
