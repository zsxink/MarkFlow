# R2B：基础 Typora Live Preview

## 目标

分 cohort 实现 optimistic + confirmed projection、marker fold/reveal 和 exact source fallback。

## 范围

- OpenSpec tasks：`7.1-7.13`。
- 主要区域：CodeMirror Lezer projection、IR projection、atomic ranges、selection/input handlers。

## Cohorts

| Cohort | Constructs | 特殊门禁 |
| --- | --- | --- |
| C1 | heading、strong | CJK composition、mouse/keyboard selection |
| C2 | emphasis、strike、inline code | nested delimiter、emoji boundary |
| C3 | link/autolink/reference | label/destination、modifier open、clipboard |
| C4 | quote、ordered/unordered/task list | current-line reveal、indent、Enter/Delete |
| C5 | thematic break、code fence | atomic range、stable dimensions、exit |

## 每个 Construct 的实现顺序

1. optimistic Lezer projection。
2. confirmed IR projection。
3. marker replace/fold 与 active minimal reveal。
4. atomic ranges、cursor、mouse、Shift+Arrow、Home/End、Select All。
5. composition neighborhood。
6. exact source fallback。
7. unit、desktop semantic、visual、manual evidence。
8. 单独批准 default-on。

## 验收

- inactive supported marker 在 semantic DOM 和视觉上均不可见。
- active context 只揭示最小 marker。
- optimistic/confirmed reconcile 不闪烁、不跳光标。
- composition/selection fixture 失败自动回退 source。
- 每个 cohort 独立验收，不以整体 R2 掩盖 default-off construct。
- 人工执行 `M-R2-03` 至 `M-R2-10`。

## 回滚

按 construct flag 回退 exact source，不改变 Core text 或其他 construct。

## 前后依赖

- 前置：[R1B](./r1b-command-history.md)、[R2A](./r2a-render-ir-v2.md)
- 后续：[R3A](./r3a-task-code-widgets.md)

