## ADDED Requirements

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

#### Scenario: 数字等高展示

- **WHEN** 用户在编辑器中输入包含数字的文本（如日期 `2024-01-15`、序号 `1.2.3`、代码 `var x = 42`）
- **THEN** 所有数字 SHALL 显示在基线上，无下沉效果（no old-style figures / hanging figures）

#### Scenario: 中英文混排一致性

- **WHEN** 用户在编辑器中输入中英文混合文本
- **THEN** 中文部分 SHALL 使用系统可用衬线中文字体（PingFang SC / Source Han Serif SC），英文部分使用 Source Serif 4，两者视觉风格协调

#### Scenario: 跨平台一致性

- **WHEN** 应用在 macOS、Windows、Linux 上运行
- **THEN** 英文和数字部分在所有平台上 SHALL 使用 Source Serif 4（字体文件打包分发），保持渲染一致性

### Requirement: 字体分发

Source Serif 4 和 Source Han Serif SC 的 woff2 文件 SHALL 打包在应用安装包内，通过 `@font-face` 声明引入，不依赖网络加载。

#### Scenario: 离线可用

- **WHEN** 用户在没有网络连接的环境下使用 MarkFlow
- **THEN** 所有字体 SHALL 正常加载和渲染，不出现字体降级或白屏

#### Scenario: @font-face 声明

- **WHEN** 应用初始化时
- **THEN** `@font-face` SHALL 正确声明 Source Serif 4（Regular + Bold）和 Source Han Serif SC（Regular + Bold）的本地路径，确保 WebView 正确加载

### Requirement: 字重覆盖

正文字体 SHALL 至少覆盖 Regular（400）和 Bold（700）两个字重。

#### Scenario: 粗体正常显示

- **WHEN** 用户编辑器中应用粗体格式（`**bold**`）
- **THEN** 粗体文本 SHALL 使用对应字体的 Bold 字重渲染，而非通过 faux bold（浏览器模拟粗体）
