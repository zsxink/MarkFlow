# R4A：Input Integrity 与 Natural Editing

## 目标

完成完整语言矩阵、自然编辑、selection、clipboard 和 accessibility 产品硬化。

## 范围

- OpenSpec tasks：`9.1-9.11`。
- `9.1-9.2` 的最小基础设施已在 R1B/R2B 前置，本阶段完成全量行为。
- 主要区域：composition coordinator、input handlers、clipboard/drop、accessibility。

## 实现

1. 完整 compositionstart/update/end，confirmed projection 在冲突邻域 defer。
2. CJK、emoji、combining、RTL、surrogate fixtures。
3. Enter/Backspace/Delete/Tab 覆盖 paragraph、heading、quote、list、table、code、form、widget。
4. 定义 internal Markdown、HTML、plain text、Files clipboard MIME policy。
5. external HTML sanitize + deterministic Markdown conversion。
6. drag/drop image 使用 revision-bound resource transaction。
7. selection/copy/paste 覆盖 hidden markers、多 block、widgets 和模式切换。
8. keyboard focus、screen reader、200% zoom、high contrast、reduced motion。

## 验收

- CJK IME 无丢字、重复、重排；composition 一次 Undo。
- grapheme/UTF-16 selection 与保存一致。
- natural editing 不改变未影响 source。
- MIME 优先级、sanitize 和 asset rollback 正确。
- Source Mode 永远可达。
- 人工执行 `M-R4-01` 至 `M-R4-06`、`M-R4-10`。

## 回滚

禁用失败 construct/widget projection，保留 plain text input、Core patch 和 Source Mode。

## 前后依赖

- 前置：[R1B](./r1b-command-history.md)、[R2B](./r2b-live-preview.md)、R3A-R3C
- 后续：[R5A](./r5a-desktop-visual-platform.md)

