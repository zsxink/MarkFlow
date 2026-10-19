# DMG 安装窗口外观契约（Issue #293 复盘与实操指南）

## 契约链路

```
assets/dmg-background.svg          设计源（人工维护）
  └─ build-dmg-background.mjs      导出为 src-tauri/assets/dmg-background.png（1×@72dpi，尺寸=windowSize）
src-tauri/tauri.conf.json          bundle.macOS.dmg：background / windowSize / appPosition / applicationFolderPosition
src-tauri/dmg-appearance.json      iconSize / textSize（Tauri DmgConfig 无对应字段，单独存）
  └─ build-dmg.mjs                 tauri build --bundles dmg → style-dmg.mjs → verify（等价于 regression 的一轮）
      style-dmg.mjs                字节级等长改写 .DS_Store（arrangeBy/iconSize/textSize/Iloc），不依赖 Finder
      verify-dmg-appearance.mjs    只读断言，期望值全部来自上面两份配置
      collect-dmg-appearance.mjs   隔离采集入口（清场→挂载→采集→断言→卸载），CI verify 用的是它
      regression-dmg-appearance.mjs  一轮化：style → collect(隔离断言+存 JSON) → Finder 截图存证
```

## 踩过的坑

### 1. 先有门禁 ≠ 发布产物经过门禁（Issue #293 根因）
v0.1.0 的 tag（09-21 16:12）早于外观修复合入（09-21 18:29+），产物实测背景图缺失、
`backgroundType=0`、`textSize=16`。**发布产物必须出自包含门禁代码的 commit**，否则
「仓库里有 verify 脚本」对用户毫无意义。发布前跑一轮：
`npm run regression:dmg -- <path/to/markflow_*.dmg>`
它会 style → 隔离断言 → 把外观事实 JSON + Finder 截图存入 `evidence/dmg-<slug>/`。

### 2. Finder 的跨 DMG 窗口状态记忆
macOS 会把上一个打开的 DMG 窗口的 icvp（视图设置）套用到下一个 DMG 窗口。在
还挂着别的 DMG 卷（包括别的项目 build 残留、目标卷自己上次中断的挂载）时直接
attach 目标卷，读数可能混入别的窗口状态，或报「资源忙」。所以所有采集前必须
先 `isolateDmgMounts`（lib/dmg-appearance.mjs）：卸载目标卷既有挂载 + 本仓库
`markflow-dmg-*` 残留；其他项目的卷只打印不动。

### 3. 打开 DMG 窗口 ≠ 窗口在屏上
- 挂载用的 mountPoint 目录（`/var/folders/.../markflow-evidence-*/m`）没有
  「磁盘图标」语义，Finder 侧 `window of disk` 查不到它；但 `open <mountPoint>`
  打开后的窗口标题就是卷名（如 "MarkFlow"），`window "MarkFlow"` 能索引到。
- 桌面解锁状态下，`screencapture -x` 整屏可用；但 `-l<windowId>`（按窗口 ID）
  需要 System Events 拿到窗口 id，而 SE 只对前台应用返回窗口 → 必须
  `Finder activate` + `delay` 之后先 SE activate 再查。
- 屏幕锁定/熄屏时 `screencapture` 产出全黑图（不报错！）——存证脚本的
  「截图大小>0」断言抓不住这种情况。熄屏后 GUI 断言不可信，回归验证以
  appearance-facts.json（.DS_Store 字节级事实）为准，截图只是给 issue 回帖用的视览佐证。

### 4. 不要用 plutil -extract 改 tauri.conf.json
`plutil -extract bundle.macOS.dmg json src-tauri/tauri.conf.json` 会**原地覆写**
整个配置文件为该子树的 JSON（81 行变 1 行）；git checkout 可救回。查看请用
python -c json.load，编辑用 edit 工具做精确文本替换。

## 本轮实测锚点（2026-10-19，构建产物 MarkFlow_0.1.0_aarch64.dmg，HEAD=b5ebab3 分支）

| 事实 | 数值 |
|---|---|
| 窗口 | 660×400，bounds `{{10,522},{660,400}}` |
| 箭头 | content y=170.5（背景图 170 处，与图标中心重合 ✅ |
| MarkFlow.app 图标 | content 中心 (179.8, 201.8)，iconSize=128 |
| Applications 文件夹 | content 中心 (479.75, 201.75)，与配置 (480,170) 对应 |
| 背景 PNG | 660×400 @72dpi，37539 字节 |
| Iloc | MarkFlow.app=(180,170) Applications=(480,170) |
| icvp | backgroundType=2 arrangeBy=none iconSize=128 textSize=13 |

「content 坐标」= Finder 窗口内相对坐标（y 含标题栏往下）。图标中心 y=201.8
对应配置 y=170 的差值 31.8pt 即标题栏高度，两者一致说明图标真的落在配置点上。

## 验证命令速查

```bash
npm run build:dmg-bg      # 设计源改过才跑（依赖 sharp，仅本机）
npm run build:dmg         # 构建 + style + verify 全链（仅 macOS）
npm run regression:dmg -- src-tauri/target/release/bundle/dmg/*.dmg  # 一轮回归+存证
node scripts/collect-dmg-appearance.mjs <dmg> [--json out.json]     # 只断言（CI 用）
```
