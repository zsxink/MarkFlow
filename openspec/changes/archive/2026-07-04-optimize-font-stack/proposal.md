## Why

当前 MarkFlow 编辑器正文字体使用 Georgia（serif），其默认数字为旧式（old-style figures），导致数字 3/4/5/7/9 下沉到基线以下，在 Markdown 编辑场景中频繁出现数字参差不齐的视觉问题。同时，中文字体仅依赖系统 fallback，不同平台上显示效果不一致。需要一套对英文、数字、中文都友好的字体方案。

## What Changes

- 英文+数字主字体改为 **Source Serif 4**（proportional lining figures，数字等高整齐）
- Mac 中文回退到系统内置 **PingFang SC**
- 非 Mac 平台（Windows/Linux）打包 **Source Han Serif SC (思源宋体)** 作为中文兜底
- 更新 CSS 变量 `--font-body` 和相关 `@font-face` 声明
- 下载并打包 Source Han Serif SC 的 woff2 文件到项目中
- 移除当前 Georgia 的 old-style figures 问题（无需额外 `font-variant-numeric`，Source Serif 4 默认就是 lining figures）

## Capabilities

### New Capabilities
- `font-stack`: 跨平台字体栈，涵盖衬线英文（Source Serif 4）、Mac 中文（PingFang SC）、非 Mac 中文打包字体（Source Han Serif SC）

### Modified Capabilities
- （无现有 spec 需要修改 — 字体变更属于 UI 调整，不影响行为级规范）

## Impact

- **CSS**: `src/styles/variables.css` — 修改 `--font-body` 变量
- **CSS/Assets**: 新增 `src/assets/fonts/` 目录，放入 Source Han Serif SC 的 woff2 文件
- **CSS**: `src/styles/main.css` 或全局样式入口 — 新增 `@font-face` 声明
- **构建**: 无影响，woff2 通过 Vite 静态资源处理即可
- **体积**: 安装包增加约 7MB（Source Han Serif SC Regular + Bold woff2）
