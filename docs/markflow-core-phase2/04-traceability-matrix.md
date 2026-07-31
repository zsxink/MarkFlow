# MarkFlow Core 二期 OpenSpec 追踪矩阵

## 1. Umbrella Task 映射

| OpenSpec tasks | 数量 | 实施工作包 | 验收 |
| --- | ---: | --- | --- |
| 1.1-1.7 | 7 | [R0A](./stages/r0a-baseline-governance.md) | M-R0-01..03 |
| 2.1-2.9 | 9 | [R0B](./stages/r0b-parser-bridge-spike.md) | M-R0-04..06 |
| 2.10 | 1 | [R0A](./stages/r0a-baseline-governance.md) | M-R0-01..03 |
| 3.1-3.10 | 10 | [R0C](./stages/r0c-projection-correctness.md) | M-R0-07..10 |
| 4.1-4.8 | 8 | [R1A](./stages/r1a-single-editor-surface.md) | M-R1-01..05 |
| 5.1-5.10 | 10 | [R1B](./stages/r1b-command-history.md) | M-R1-06..10 |
| 6.1-6.9 | 9 | [R2A](./stages/r2a-render-ir-v2.md) | M-R2-01..02 |
| 7.1-7.13 | 13 | [R2B](./stages/r2b-live-preview.md) | M-R2-03..10 |
| 8.1, 8.7-8.8 | 3 | [R3A](./stages/r3a-task-code-widgets.md) | M-R3-01..02 |
| 8.2-8.6 | 5 | [R3B](./stages/r3b-table-image-widgets.md) | M-R3-03..08 |
| 8.9-8.11 | 3 | [R3C](./stages/r3c-frontmatter-diagram-html.md) | M-R3-09..12 |
| 8.12 | 1 | R3A/R3B/R3C 分担，[R3C](./stages/r3c-frontmatter-diagram-html.md) 汇总 | M-R3-01..12 |
| 9.1-9.11 | 11 | [R4A](./stages/r4a-input-integrity.md)；9.1-9.2 前置到 R1B/R2B | M-R4-01..06,10 |
| 10.1-10.8 | 8 | [R4B](./stages/r4b-performance-security.md) | M-R4-07..09 |
| 11.1-11.10 | 10 | [R5A](./stages/r5a-desktop-visual-platform.md) | M-R5-01..04 |
| 11.11 | 1 | [R5B](./stages/r5b-stability-observation.md) | M-R5-05 |
| 12.1-12.10 | 10 | [R5C](./stages/r5c-cleanup-archive.md) | M-R5-06 + final gate |
| **合计** | **119** |  |  |

`8.12` 虽由三个 child change 分担，但 task owner 只能是 R3C 汇总 child；R3A/R3B 以 prerequisite
evidence 链接回汇总项，避免三个分支重复勾选同一 task。

## 2. Capability 映射

| Delta spec capability | 主工作包 | 关联验收 |
| --- | --- | --- |
| `codemirror-source-editor` | R1A | M-R1-01..05 |
| `core-backed-wysiwyg` | R0C/R2B | M-R0-07..10, M-R2-03..10 |
| `core-bridge-protocol` | R0B/R0C | M-R0-06..10 |
| `core-diagram-render-targets` | R3C | M-R3-11 |
| `e2e-test-coverage` | R5A | M-R5-01..04 |
| `editor-input-integrity` | R1B/R4A | M-R1-08..10, M-R4-01..06 |
| `frontmatter-core` | R3C | M-R3-09..10 |
| `gfm-table-core` | R3B | M-R3-03..05 |
| `image-storage-engine` | R3B | M-R3-06..08 |
| `keyboard-shortcuts` | R1B/R4A | M-R1-06..10, M-R4-03..05 |
| `markdown-semantic-projection` | R0B/R2A | M-R0-04..05, M-R2-01..02 |
| `regression-coverage` | 全阶段，R5C 汇总 | 所有 required automated/manual cases |
| `source-mode-core` | R1A/R1B | M-R1-01..10 |
| `structured-block-editing` | R3A-R3C | M-R3-01..12 |
| `typora-live-preview` | R2B | M-R2-03..10 |
| `visual-release-gate` | R0A/R4B/R5A-R5B | M-R4-07..10, M-R5-01..05 |

## 3. 状态词汇

| 状态 | 含义 |
| --- | --- |
| Planning complete | proposal/design/specs/tasks 已生成并 validate |
| Implemented | 代码存在，尚不能推断测试或产品完成 |
| Automated verified | 当前 commit 的 required automated gate 通过 |
| Desktop verified | 真实 Tauri WebView semantic E2E 通过 |
| Platform verified | 指定 OS/IME/环境人工证据通过 |
| Product accepted | P0/P1 全证据与 observation 通过 |
| Archived | specs 已 sync，change 已 archive 且 archive checks 通过 |

正式 umbrella charter 已归档并同步 specs。当前工作区被忽略的同名 active 副本显示 `0/119`，
仅可作为评审输入，不是实施追踪源。准确状态是：
`Charter archived; planning complete; implementation evidence not established; not product accepted`。
