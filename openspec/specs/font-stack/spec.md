# font-stack Specification

## Purpose
定义跨平台中西文字体栈、字体分发及字重覆盖要求。

## Agent Context
- **源码入口：** `src/styles/app.css`、`src/styles/editor.css` 与 `src/styles/variables.css`。
- **关联规范：** `bundle-budget`、`editor-bottom-spacer`。
- **不变量：** 字体回退必须覆盖中西文平台；字重映射不得造成伪粗体；字体变更不得突破包体预算。
- **验证：** `npm run build`；`npm run check-size`；`npx openspec validate font-stack --strict`。

## Requirements

### Requirement: 跨平台字体栈

MarkFlow 编辑器正文（ProseMirror 编辑器区域）SHALL 使用如下字体栈：

```css
--font-body: 'Source Serif 4', 'PingFang SC', 'Source Han Serif SC', 'Microsoft YaHei', serif;
```

字体栈含义：
1. **Source Serif 4** — 英文+数字主字体。MUST 使用 proportional lining figures（等高数字），解决旧式数字下沉问题
2. **PingFang SC** — macOS 中文回退。利用系统内置字体，无需打包
3. **Source Han Serif SC** — 非 Mac 平台中文主回退。打包分发，SIL OFL 协议
4. **Microsoft YaHei** — Windows 系统兜底
5. **serif** — 通用兜底

字体加载策略变更：
- 中文字体（Source Han Serif SC）SHALL 优先使用系统字体，仅在系统无可用中文字体时回退到内置字体
- 内置中文字体 SHALL 进行子集化处理，仅包含常用字符（覆盖 GB2312 + 扩展常用汉字），总大小 SHALL 不超过 4MB
- 稀有字符 SHALL 回退到系统字体或通用 serif，不因缺少内置字形而显示方块
- Bold 字重 SHALL 评估 variable font 替代方案，若不可行则仅保留 Regular 字重，粗体通过 CSS `font-weight: bold` 由系统合成

#### Scenario: 数字等高展示

- **WHEN** 用户在编辑器中输入包含数字的文本（如日期 `2024-01-15`、序号 `1.2.3`、代码 `var x = 42`）
- **THEN** 所有数字 SHALL 显示在基线上，无下沉效果（no old-style figures / hanging figures）

#### Scenario: 中英文混排一致性

- **WHEN** 用户在编辑器中输入中英文混合文本
- **THEN** 中文部分 SHALL 使用系统可用衬线中文字体（PingFang SC / Source Han Serif SC），英文部分使用 Source Serif 4，两者视觉风格协调

#### Scenario: 跨平台一致性

- **WHEN** 应用在 macOS、Windows、Linux 上运行
- **THEN** 英文和数字部分在所有平台上 SHALL 使用 Source Serif 4（字体文件打包分发），保持渲染一致性

#### Scenario: 中文字体子集化

- **WHEN** 应用在非 macOS 平台启动
- **THEN** 内置中文字体 SHALL 仅加载子集版本，总大小不超过 4MB，覆盖 GB2312 常用汉字

#### Scenario: 稀有字符回退

- **WHEN** 用户输入系统内置字体未覆盖的稀有字符
- **THEN** 该字符 SHALL 回退到系统通用 serif 字体渲染，不显示方块或 tofu

### Requirement: 字体分发

Source Serif 4 的 woff2 文件 SHALL 打包在应用安装包内，通过 `@font-face` 声明引入，不依赖网络加载。Source Han Serif SC 的子集化版本 SHALL 同样打包分发。

#### Scenario: 离线可用

- **WHEN** 用户在没有网络连接的环境下使用 MarkFlow
- **THEN** 所有字体 SHALL 正常加载和渲染，不出现字体降级或白屏

#### Scenario: @font-face 声明

- **WHEN** 应用初始化时
- **THEN** `@font-face` SHALL 正确声明 Source Serif 4（Regular + Bold + Italic + BoldItalic）和 Source Han Serif SC（子集化 Regular + Bold）的本地路径，确保 WebView 正确加载

### Requirement: 字重覆盖

正文字体 SHALL 至少覆盖 Regular（400）和 Bold（700）两个字重。

#### Scenario: 粗体正常显示

- **WHEN** 用户编辑器中应用粗体格式（`**bold**`）
- **THEN** 粗体文本 SHALL 使用对应字体的 Bold 字重渲染，而非通过 faux bold（浏览器模拟粗体）
