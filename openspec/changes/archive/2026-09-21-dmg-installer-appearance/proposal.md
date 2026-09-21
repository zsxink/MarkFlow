## Why

MarkFlow 的 macOS DMG 安装窗口目前是 Tauri 全默认外观：660×400 纯白底、图标 48pt、无任何安装指引。更关键的是，实测产物 `.DS_Store` 中 `arrangeBy=name` —— Finder 会因此完全忽略配置的图标坐标，把图标按名称重排到左上角。用户打开安装包看到的是一片空白加两个挤在角落的图标，既无品牌感，也没有「拖进 Applications」的引导。

## What Changes

- 在 `tauri.conf.json` 的 `bundle.macOS.dmg` 中显式声明背景图与布局参数（`background` / `windowSize` / `appPosition` / `applicationFolderPosition`），不再依赖隐式默认值。
- 新增 DMG 背景图设计资产：暖白 `#F7F3EE` 底 + `#BE4A29` 赭红箭头，箭头水平指向 Applications 图标位置；SVG 为可审查源，PNG 为打包实际引用物。
- 新增**产物归一化**步骤：不依赖 Finder / AppleScript，直接改写 DMG 卷内 `.DS_Store` 的 `icvp` 与 `Iloc` 字节，确保 `arrangeBy=none`、图标尺寸与两处图标坐标最终符合配置。
- 新增**产物断言**脚本：只读挂载 DMG，读回 `.DS_Store` 断言外观契约；断言阈值从 `tauri.conf.json` 读取，避免配置与脚本两处漂移。
- 在 release 流程的 macOS job 中接入「归一化 → 断言 → 重新上传」，使外观回归在发版前被拦截。

## Capabilities

### New Capabilities

- `dmg-installer-appearance`: 定义 macOS DMG 安装窗口的外观契约——背景图随包分发且被 `icvp` 引用、图标不自动排列、图标尺寸与两处图标坐标符合配置、窗口尺寸符合配置，并规定上述各项在**产物层面**可被自动验证。

### Modified Capabilities

（无）

## Impact

- **配置**：`src-tauri/tauri.conf.json`（新增 `bundle.macOS.dmg` 块）。
- **新增资产**：`src-tauri/assets/dmg-background.png`（打包引用）、配套设计源 SVG。
- **新增脚本**：`scripts/style-dmg.mjs`（归一化）、`scripts/verify-dmg-appearance.mjs`（断言）、背景图生成脚本。
- **新增依赖**：`sharp`（devDependency，仅用于从 SVG 重新生成背景图；打包与验证路径不依赖它）。
- **CI**：`.github/workflows/release.yml` 的 macOS job 增加归一化、断言与重新上传三个步骤。
- **兼容性**：仅影响 macOS DMG 外观，不触碰应用运行时行为、Windows NSIS 与 Linux 打包产物。已发布的 DMG 不受影响。改动不涉及 Rust 代码。
