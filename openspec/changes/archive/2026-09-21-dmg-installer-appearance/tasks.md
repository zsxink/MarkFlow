## 实施清单

### 1. 背景图设计资产

- [ ] 编写背景图设计源（SVG），按 design.md Decision 7 的规范：画布 660×400、底色 `#F7F3EE`、顶部居中「MarkFlow」字样、水平箭头 `x∈[262,400]` @ `y=170`、安装文案基线 `y≈316`。
- [ ] 核对安全区：两处图标占位 `x∈[116,244] ∪ [416,544]`、`y∈[106,256]` 内不得出现任何视觉元素。
- [ ] 核对文案色对比度：`#6B6058` on `#F7F3EE` 不低于 4.5:1。
- [ ] 新增背景图生成命令（`sharp` 作为 devDependency），从设计源导出打包用的 PNG，尺寸严格等于配置的窗口尺寸。
- [ ] 提交生成的 PNG，并确认打包与断言路径均不依赖 `sharp`。

### 2. Tauri 配置

- [ ] 在 `src-tauri/tauri.conf.json` 的 `bundle.macOS` 下新增 `dmg` 块，显式声明 `background`、`windowSize`、`appPosition`、`applicationFolderPosition`（数值见 design.md Decision 2）。
- [ ] 确认 `background` 路径按 Tauri 的相对路径规则解析，构建后卷内出现 `.background/` 目录与背景图文件。

### 3. 产物归一化脚本

- [ ] 新增 `scripts/style-dmg.mjs`：`hdiutil convert -format UDRW` → `hdiutil attach -readwrite -nobrowse -mountpoint <tmpdir>` → 确保卷内背景图存在 → 改写 `.DS_Store` → `hdiutil detach` → `hdiutil convert -format UDZO` → 替换原文件。
- [ ] 实现 `.DS_Store` 解析（`icvp` / `bwsp` / `Iloc` 三类记录），并抽出为可供断言脚本复用的独立模块。
- [ ] 实现等长原地改写：`arrangeBy` 的 ASCII 短串 `name` → `none`；`iconSize` 的 8 字节 big-endian double 覆写为设计目标值。长度不匹配时明确报错退出，不尝试重排记录表。
- [ ] 确保归一化在 Finder / AppleScript 之后执行，成为最后一个写入者；脚本需幂等。
- [ ] 产物缺少 `.DS_Store` 时按预置模板构造；构造失败则非零退出，不得产出外观未达标却标记成功的产物。

### 4. 产物断言脚本

- [ ] 新增 `scripts/verify-dmg-appearance.mjs`：以只读方式挂载 DMG，按规范中的外观契约逐项断言（背景图存在且被引用、`arrangeBy=none`、两处图标坐标、`iconSize`、窗口尺寸）。
- [ ] 期望值从 `src-tauri/tauri.conf.json` 的 `bundle.macOS.dmg` 读取，脚本内不硬编码坐标。
- [ ] 全部通过时输出 OK 并以 0 退出；任一失败时逐条打印期望值与实测值并非零退出；过程中不修改产物字节。
- [ ] 在 `package.json` 中暴露验证命令（如 `npm run verify:dmg`）。

### 5. 接线到 release 流程

- [ ] 在 `.github/workflows/release.yml` 的 macOS job 中，于 `tauri-action` 之后增加三步：归一化 → 断言 → `gh release upload --clobber` 覆盖已上传的 DMG。
- [ ] 确认 `permissions: contents: write` 满足重新上传需求，且断言失败时 job 失败、草稿 release 不发布。

### 6. 验证

- [ ] 本地构建 DMG，执行归一化 + 断言，得到绿。
- [ ] **红绿反证**：对未归一化的产物执行断言，必须报红（`arrangeBy` 与 `iconSize` 两项失败），证明断言真的能失败。
- [ ] **目视验证**：挂载归一化后的 DMG → Finder 弹出安装窗口 → 截图，确认箭头与两处图标处于同一水平线、背景为暖白、无元素落入图标安全区。
- [ ] 实测校准图标尺寸：确认 128pt 在 660×400 窗口中的观感；若过大则回落到 96–112 区间的某一档，并**同步更新配置、归一化脚本与断言**，不留两处数值。
- [ ] 可选优化项：验证 144 DPI 的 2× 背景图能否提升 Retina 清晰度且不破坏构图；若发生裁切则维持 1×（design.md Decision 3）。
- [ ] 运行 `npm test`、`npx tsc --noEmit`、`npm run validate:openspec`。
- [ ] 合入前派独立 agent 复核（AGENTS.md 强制要求）。
