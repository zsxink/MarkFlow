# Design

## Context

Issue #293 报告的错位源于 v0.1.0 产物先于门禁体系发布（根因见 proposal）。当前 HEAD 链路在本机实测已经对齐（build → style → verify 全通过， Finder 挂载截图像素分析：背景箭头 content y=170.5，两处图标中心 content y≈170，与配置 (180,170)/(480,170) 完全一致）。但在审计过程中发现两个仍需补强的环节：

1. **跨窗口状态泄漏**：macOS 会把上一个打开的 DMG 窗口的视图设置（`icvp`）套用给下一个 DMG 窗口。`collectAppearance` 目前在 verify 脚本内直接挂载被检 DMG —— 如果本机还挂着别的 DMG 卷，采集读数依赖 Finder 状态，断言可能把「别的窗口的状态」当成目标产物的状态。
2. **缺一轮化回归入口**：v0.1.0「修复未进入产物」无人察觉，正是因为没有「对最终产物一轮跑完归一化→断言→存证」的独立入口，发布流程依赖开发者记得调用三个分离命令。

## Goals / Non-Goals

- **Goals**
  - 断言事实采集在隔离状态下进行（先清已挂载卷 → 挂载目标卷 → 独立进程采集 → 卸载）。
  - 提供单条命令完成「normalize → verify → 存证」的回归入口，证据落盘到 `evidence/`。
  - 期望值与失败判定逻辑继续沿用 `checkAppearance`，单一可信来源不移动。
- **Non-Goals**
  - 不改 `tauri.conf.json` 的坐标/窗口尺寸/背景图内容（当前已正确，改动反而引入回归风险）。
  - 不 revisiting create-dmg 模板或 vendor 上游脚本。

## Decisions

**Decision 1：新增独立入口 `collect-dmg-appearance.mjs`，不复用 verify 内挂载路径。**

verify 脚本继续可用（in-process），但新增独立入口供 CI 与回归脚本调用：入口先 `hdiutil info` 列出并卸载非本卷的被标记 DMG 挂载点，再挂载目标卷采集，最后 detach。这样 verify 的读数不再受本机 Finder 状态干扰。

**Decision 2：`regression-dmg-appearance.mjs` = style → verify → 存 JSON + 截图证据。**

style / verify 内部已经是原子性的独立步骤（style 是字节级等长覆盖、verify 是只读断言）。回归脚本只是把三步串起来，并在最后把 (a) `collect-dmg-appearance` 输出的事实 JSON、(b) 打开挂载卷的 Finder 窗口截图，一并落到 `evidence/` 目录，供 issue 关闭时回读佐证。截图尺寸大于 0 是最小一致性断言（能抓到「Fler 挂载但窗口没打开」的空截图）。

**Decision 3：发布流水线 verify 步骤换成隔离采集。**

`.github/workflows/release.yml` 的 verify 命令改为 `node scripts/collect-dmg-appearance.mjs "$dmg"`，断言逻辑不变。style 步骤保持不变（它本身就是字节级写入，不读 Finder 状态）。

**Decision 4：把本轮实测锚点写进归档设计文档。**

复盘时写下：箭头 y=170.5、MarkFlow 图标绘图区 content (128,151)-(231.5,252.5) 中心 (179.8,201.8)、Applications 蓝色图标中心 (479.75,201.75)、背景 PNG 1×@72dpi。后续版本查阅这些数值可以快速校准背景设计的新一轮构图。

## Risks / Trade-offs

- [verify 前卸载他人挂载的卷，可能与用户手动操作冲突] → 只对「被 markflow 脚本挂载过（挂载点名含 `markflow-dmg-`）」的卷做静默清理；其他卷在卸载前打印清楚的清单，失败时保留原样。
- [截图证据依赖本机 Finder 可用] → 截图失败只降级为警告（JSON 事实仍为准），不阻塞断言结果。
- [`icvp` 跨窗口语义无法从 Finder 层面禁用] → 隔离采集序列本身就是对这个 upper-bound 的唯一有效防御（先清场再看新窗口）。

## Migration Plan

1. 实现两个新脚本 + release.yml verify 步骤替换。
2. 本机对现有 DMG 一轮运行 regression 验证全链通过。
3. 下一次发 tag 时 CI 会自动走新入口，打出的产物经由本轮验证后才允许 publish。

## Open Questions

（无）
