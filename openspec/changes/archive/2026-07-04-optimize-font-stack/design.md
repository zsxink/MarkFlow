## Context

当前 MarkFlow 编辑器由 `src/styles/variables.css` 中的 `--font-body` 变量控制正文字体：

```css
--font-body: Georgia, 'Times New Roman', serif;
```

Georgia 是优秀的衬线字体，但其默认启用 old-style figures（旧式数字），导致 3、4、5、7、9 等数字下沉到基线以下。在 Markdown 编辑场景（代码、日期、序号、数据等）中，这种高低错落的问题频繁出现，影响阅读体验。

同时，中文字体完全依赖系统 fallback，不同平台显示不一致。需要一套跨平台字体策略：

- 英文+数字使用等高数字的衬线字体
- Mac 用户利用系统内置字体（PingFang SC）
- 非 Mac 用户通过打包字体获得一致的中文体验
- 全部使用开源可商用字体协议

## Goals / Non-Goals

**Goals:**
- 解决 Georgia 数字错落问题
- English + 数字使用等高、美观的衬线字体
- Mac 中文用 PingFang SC（系统内置，无需打包）
- Windows/Linux 用 Source Han Serif SC（思源宋体，打包分发）
- 全部字体开源可商用（SIL OFL 协议）
- 保持衬线阅读体验，不改变应用风格

**Non-Goals:**
- 不修改代码字体（`--font-code`，当前 SF Mono 等表现良好）
- 不修改 UI 字体（`--font-ui`，当前系统无衬线栈表现良好）
- 不增加字体选择/切换 UI 功能
- 不涉及字体大小的调整

## Decisions

### 1. 英文主字体：Source Serif 4

- **原因**：Adobe 出品，与 Source Han Serif 同家族，视觉统一；默认使用 proportional lining figures（比例等高数字），数字整齐不参差；SIL OFL 协议，完全开源可商用；字形现代、阅读感好
- **不考虑 Georgia**：即使加上 `font-variant-numeric: lining-nums` 可以解决数字问题，但 Georgia 对中文字体亲和度差（不是为 CJK 设计），且在非 Mac/Win 平台不可靠
- **不考虑 Noto Serif**：对英文部分而言，Source Serif 4 的字形更精致，且与 Source Han Serif 共享设计DNA

### 2. 中文兜底分层策略

字体栈顺序：

```
'Source Serif 4', 'PingFang SC', 'Source Han Serif SC', 'Microsoft YaHei', serif
```

| 平台 | 英文+数字 | 中文 |
|------|----------|------|
| macOS | Source Serif 4 | PingFang SC（系统内置）→ Source Han Serif SC（如果安装） |
| Windows | Source Serif 4 | Microsoft YaHei（系统内置） |
| Linux | Source Serif 4 | Source Han Serif SC（打包） |
| 有安装思源宋体的任意平台 | Source Serif 4 | Source Han Serif SC |

### 3. 字体分发策略

- Source Serif 4：直接从 Google Fonts 等来源下载 woff2，打包进项目
- Source Han Serif SC：从 Adobe 官方仓库下载 woff2 子集或完整字体，打包进项目
- 只在项目 `src/assets/fonts/` 目录存放 woff2 文件，通过 Vite 静态资源机制引入

### 4. 不采用 @import 远程加载

桌面应用不应依赖网络加载字体，应全部内嵌。且 CJK 字体文件较大，远程加载会导致白屏。

## Risks / Trade-offs

- **[体积]** Source Han Serif SC 的 woff2 约 3-4MB（Regular + Bold 约 7MB）。安装包增量约 7MB，对桌面应用属可接受范围。**→ 可以只打包 Regular 和 Bold 两个字重，不打包 ExtraLight、Heavy 等不常用字重**
- **[覆盖]** 部分 Linux 发行版可能既无 PingFang 也无 Source Han Serif，但 fallback 到 serif 后至少能正确渲染。**→ 字体栈最后保留 serif 通用兜底**
- **[版权]** 所有字体均为 SIL OFL 协议，允许免费再分发。**→ 在项目 README 或 LICENSE 中注明字体归属**
