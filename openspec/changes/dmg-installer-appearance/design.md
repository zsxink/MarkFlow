## Context

### 现状取证

对当前产物 `src-tauri/target/release/bundle/dmg/MarkFlow_0.1.0_aarch64.dmg` 做只读挂载，解析卷内 `.DS_Store`：

| 项 | 实测值 | 对照 |
|---|---|---|
| `bundle.macOS.dmg` 配置块 | 不存在 | `tauri.conf.json` 的 `bundle.macOS` 只有 `minimumSystemVersion` |
| `bwsp.WindowBounds` | `{{10, 522}, {660, 400}}` | 等于 Tauri 默认 `windowSize` |
| `MarkFlow.app` 的 `Iloc` | `(180, 170)` | 等于 Tauri 默认 `appPosition` |
| `Applications` 的 `Iloc` | `(480, 170)` | 等于 Tauri 默认 `applicationFolderPosition` |
| `icvp.backgroundType` | `0`，`backgroundColorRGB = (1,1,1)` | 无背景图，纯白 |
| `icvp.arrangeBy` | **`name`** | 应为 `none` |
| `icvp.iconSize` | **`48.0`** | create-dmg 模板意图为 `128` |
| `icvp.textSize` / `gridSpacing` | `12.0` / `100.0` | Finder 默认 |
| 卷图标 `.VolumeIcon.icns` | 存在 | 已正确 |

### 机制分析：为什么布局没落地

Tauri 的 DMG 打包走 fork 自 create-dmg 1.2.1 的 `bundle_dmg.sh`，外观设置由 `template.applescript` 驱动。该模板的顺序本身是**正确**的：

```applescript
tell container window
  set current view to icon view          -- 第 16 行：先切视图
  ...
end tell
set opts to the icon view options of container window   -- 第 24 行：再取 options
tell opts
  set icon size to ICON_SIZE             -- 第 26 行
  set text size to TEXT_SIZE
  set arrangement to not arranged        -- 第 28 行
end tell
```

但产物中 `iconSize=48`、`arrangeBy=name` —— 两项 option 均未保住，只有窗口 bounds 生效。模板第 41–42 行 `close` / `open` 之后**没有重新确认** icon view options，这是可疑点，但根因尚未完全定位。

**本变更的策略不是去修 AppleScript 的时序，而是让最终外观不依赖它**：Finder 是最后一个写入者，时序脆弱且不可测；改为事后对产物做确定性归一化 + 断言，无论上游模板行为如何都成立。

### Tauri v2 `DmgConfig` 的能力边界

查 `node_modules/@tauri-apps/cli/config.schema.json`，`DmgConfig` 仅有 5 个字段：

| 字段 | 类型 | 默认 |
|---|---|---|
| `background` | string（png/jpg/gif） | 无 |
| `windowPosition` | Position | 无 |
| `windowSize` | Size | `{660, 400}` |
| `appPosition` | Position | `{180, 170}` |
| `applicationFolderPosition` | Position | `{480, 170}` |

**没有** `iconSize` / `textSize` / `arrangeBy`。因此「图标放大」与「图标不自动排列」无法单靠配置达成，必须在产物层面处理。

### 品牌资产

应用内主题（`src/styles/variables.css`）与 wordmark（`assets/markflow-wordmark.svg`）给出的色值：

| 语义 | 应用内 | wordmark |
|---|---|---|
| 主色 | `--accent: #B5472A` | `#BE4A29` |
| 背景 | `--bg: #FAFAF8` | `#F7F3EE` |
| 正文 | `--fg: #1A1A1A` | `#2A2522` |

两套主色并存（`#B5472A` vs `#BE4A29`）是既有偏差，本变更**不处理**（见 Non-Goals）。

## Goals / Non-Goals

**Goals:**

- DMG 安装窗口有品牌化背景，用户在窗口内能直接看出「把 MarkFlow 拖进 Applications」。
- 图标位置、图标尺寸、窗口尺寸与背景图构图**互相对齐且可验证**，不因默认值变动或 Finder 行为漂移。
- 外观回归可被自动化拦截：发版前对产物本身断言，而不是只看打包日志。

**Non-Goals:**

- 不改 Windows NSIS / Linux 包的外观。
- 不改 `.VolumeIcon.icns`（实测已正确）。
- 不做代码签名与公证。
- 不统一 `#B5472A` / `#BE4A29` 两套主色（属独立的品牌一致性问题，避免本变更扩散）。
- 不追求 Retina 下的绝对清晰度（见 Decision 3）。
- 不修改 create-dmg 模板或 vendor 其脚本。

## Decisions

**Decision 1：布局参数显式写入 `tauri.conf.json`，不再依赖隐式默认值。**

即使本轮保留 Tauri 的默认数值，也要把它们显式写进 `bundle.macOS.dmg`。

理由：默认值是隐式的，上游一旦调整（Tauri 默认值历史上发生过变化），背景图的构图就会静默错位——箭头指向空处。显式声明使「背景图构图」与「图标坐标」成为同一份契约的两半，也让断言脚本有单一可信来源。

**Decision 2：保持 `windowSize = 660×400` 与坐标 `(180,170)` / `(480,170)`。**

不为了「视觉更居中」而调坐标。

理由：660×400 是 Tauri 官方默认值，与这两个坐标的几何关系经过上游验证；改坐标只会把风险从「背景图是否对齐」转移到「坐标是否真的落地」——而后者恰恰是当前最薄弱的环节。背景图围绕既有坐标设计是零风险的解法。两图标中心距 300pt、左右各距边缘 180pt，本身是对称构图。

**Decision 3：背景图按 1× 出图（660×400 @72dpi），不做 @2x。**

理由：Finder 的背景图**不做 DPI 缩放**。若交付 1320×800 的图而 Finder 按 point 渲染，将只显示左上角 660×400 区域，构图直接崩坏。1× 是唯一安全的默认值；Retina 清晰度作为可选优化项单列（见 tasks 中的验证项），不阻塞本变更。

**Decision 4：SVG 为唯一可审查源，PNG 为提交的生成物。**

理由：SVG 可 diff、可随品牌色更新、几何与坐标可被人工核对；PNG 提交进仓库则使打包与 CI 验证路径**不依赖任何图像库**（CI 是 ubuntu runner，装不了 macOS 侧的渲染链）。生成脚本用 `sharp` 作为 devDependency，只在人工需要重新导出时运行。

**Decision 5：布局归一化不依赖 Finder / AppleScript，直接改写产物内 `.DS_Store` 字节。**

流程：`hdiutil convert <dmg> -format UDRW` → `hdiutil attach -readwrite -nobrowse -mountpoint <tmp>` → 按需补 `.background/<name>` → 改写 `icvp` / `Iloc` → `hdiutil detach` → `hdiutil convert -format UDZO` → 替换原文件。

理由：AppleScript 依赖 GUI 会话与自动化权限，在 CI 上天然脆弱（实测本机 GUI 环境下两项 option 都未落地，更难指望 runner）。字节级改写是确定性的、可离线校验的，且把「读取当前值 → 断言」与「写入目标值」复用同一套解析代码。

两项改写都恰好可以**等长原地覆盖**，无需重排 bplist：

- `arrangeBy`：值是以 `0x5N` marker 开头的 ASCII 短串，`name` → `none` 同为 4 字节。
- `iconSize`：值是 `0x23` marker 的 8 字节 big-endian double，直接覆写 `48.0` → 目标值。

若遇到长度不等的情况（例如未来目标串更长），脚本必须**明确报错退出**，不得尝试重排整个记录表。

**Decision 6：断言阈值从 `tauri.conf.json` 读取，脚本内不重复硬编码坐标。**

理由：坐标若在配置与脚本各存一份，必然漂移。断言脚本解析 `bundle.macOS.dmg` 作为期望值，与产物实测值比对。

**Decision 7：背景图视觉规范。**

画布 660×400，内容区坐标：

| 元素 | 位置 / 规格 |
|---|---|
| 底色 | `#F7F3EE` 满铺 |
| 顶部品牌标识 | 「MarkFlow」居中于 `y≈48`，字号 22、字重 700，`#2A2522` + 「Flow」用 `#BE4A29` |
| 箭头 | 水平线段 `x∈[262, 400]`、`y=170`（**与图标中心同一水平线**），线宽 7、圆头端，`#BE4A29`；箭头头部三角尖端在 `(400,170)`，长 22、底宽 26 |
| 安装提示文案 | 「拖入 Applications 完成安装」居中，字号 13、`#6B6058`，基线 `y≈316` |

**安全区（不得放置任何元素）：** `x∈[116,244] ∪ [416,544]`，`y∈[106,256]` —— 即两处图标及其下方 label 的实际占位（图标 128pt 以中心对称展开，label 约 22pt）。

关键设计约束：**箭头与图标中心严格同高**。图标中心 y 与内容区原点之间的偏移存在不确定性（Finder 窗口标题栏是否计入内容区、不同系统版本可能不同），把箭头锁在同一水平线上可让构图对该偏移**免疫**——即便整体上下偏移，箭头与图标仍然对齐。

文案色对比度：#6B6058 on #F7F3EE ≈ **5.6:1**，满足 WCAG AA 对正文的要求。

## Risks / Trade-offs

| 风险 | 说明 | 缓解 |
|---|---|---|
| 根因未完全定位 | `arrangeBy` / `iconSize` 丢失的确切原因未确认（模板时序可疑但未证实） | 策略上绕开它：归一化在 AppleScript **之后**执行，成为最后一个写入者，无论上游行为如何结果确定 |
| 直接改写二进制 `.DS_Store` 较脆弱 | 私有格式，Apple 可能变更记录布局 | 解析与改写逻辑集中在单一模块并被断言脚本复用；解析失败时明确报错退出，不静默降级 |
| CI 上 AppleScript 可能整体失败 | `bundle_dmg.sh` 在 AppleScript 失败时 `exit 64` 硬失败，DMG 可能无 `.DS_Store` | 归一化脚本在缺少 `.DS_Store` 时按预置模板构造；若构造失败则明确失败，不产出一个"看起来通过"的包 |
| Retina 下背景偏软 | 1× 图在 Retina 屏被放大 | 已知取舍，列为可选优化项；清晰度不达标时不影响构图正确性 |
| 归一化后需重新上传 | tauri-action 已把 DMG 上传到 draft release | 归一化 → 断言 → `gh release upload --clobber` 覆盖；失败时 job 失败，draft 不发布 |
| 图标 128pt 可能过大 | 与 660×400 窗口的观感需实测 | 作为 tasks 中的实测校验项，允许回落到 96–112 区间并同步更新配置与断言 |
