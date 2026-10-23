# Spec Delta

## MODIFIED Requirements

### Requirement: 跨平台字体栈

MarkFlow 编辑器正文（ProseMirror 编辑器区域）SHALL 使用如下字体栈：

```css
--font-body: 'Source Serif 4', 'PingFang SC', 'MarkFlow Serif SC', 'Microsoft YaHei', serif;
```

字体栈含义：
1. **Source Serif 4** — 英文+数字主字体。MUST 使用 proportional lining figures（等高数字），解决旧式数字下沉问题
2. **PingFang SC** — macOS 中文回退。利用系统内置字体，无需打包
3. **MarkFlow Serif SC** — 非 Mac 平台中文主回退。打包分发，SIL OFL 协议；该族名 MUST NOT 包含上游保留字体名 `Source`
4. **Microsoft YaHei** — Windows 系统兜底
5. **serif** — 通用兜底

字体加载策略变更：
- 中文字体（MarkFlow Serif SC）SHALL 优先使用系统字体，仅在系统无可用中文字体时回退到内置字体
- 内置中文字体 SHALL 进行子集化处理，仅包含常用字符（覆盖 GB2312 + 扩展常用汉字），总大小 SHALL 不超过 4MB
- 稀有字符 SHALL 回退到系统字体或通用 serif，不因缺少内置字形而显示方块
- Bold 字重 SHALL 评估 variable font 替代方案，若不可行则仅保留 Regular 字重，粗体通过 CSS `font-weight: bold` 由系统合成

#### Scenario: 数字等高展示

- **WHEN** 用户在编辑器中输入包含数字的文本（如日期 `2024-01-15`、序号 `1.2.3`、代码 `var x = 42`）
- **THEN** 所有数字 SHALL 显示在基线上，无下沉效果（no old-style figures / hanging figures）

#### Scenario: 中英文混排一致性

- **WHEN** 用户在编辑器中输入中英文混合文本
- **THEN** 中文部分 SHALL 使用系统可用衬线中文字体（PingFang SC / MarkFlow Serif SC），英文部分使用 Source Serif 4，两者视觉风格协调

#### Scenario: 跨平台一致性

- **WHEN** 应用在 macOS、Windows、Linux 上运行
- **THEN** 英文和数字部分在所有平台上 SHALL 使用 Source Serif 4（字体文件打包分发），保持渲染一致性

#### Scenario: 中文字体子集化

- **WHEN** 应用在非 macOS 平台启动
- **THEN** 内置中文字体 SHALL 仅加载子集版本，总大小不超过 4MB，覆盖 GB2312 常用汉字

#### Scenario: 稀有字符回退

- **WHEN** 用户输入系统内置字体未覆盖的稀有字符
- **THEN** 该字符 SHALL 回退到系统通用 serif 字体渲染，不显示方块或 tofu

#### Scenario: 内置字体族名符合保留字体名条款

- **WHEN** 应用加载内置中文字体，或导出 HTML 引用该字体
- **THEN** 使用的字体族名 MUST NOT 包含上游保留字体名 `Source`
- **THEN** 字体文件内部的族名记录 SHALL 与 CSS 中声明的族名一致

### Requirement: 字体分发

Source Serif 4 的 woff2 文件 SHALL 打包在应用安装包内，通过 `@font-face` 声明引入，不依赖网络加载。内置中文字体的子集化版本 SHALL 同样打包分发。

随包字体的版权与许可证信息 SHALL 在字体文件内部保留，并随发行包提供可获取的许可证文本。

字体来源与修改记录 SHALL 保存在仓库中，逐项写明上游来源、上游版本、上游与本地文件校验值、修改方式。

#### Scenario: 离线可用

- **WHEN** 用户在没有网络连接的环境下使用 MarkFlow
- **THEN** 所有字体 SHALL 正常加载和渲染，不出现字体降级或白屏

#### Scenario: @font-face 声明

- **WHEN** 应用初始化时
- **THEN** `@font-face` SHALL 正确声明 Source Serif 4（Regular + Bold + Italic + BoldItalic）和内置中文字体（子集化 Regular + Bold）的本地路径，确保 WebView 正确加载

#### Scenario: 字体内部保留版权与许可证

- **WHEN** 检查任一随包字体文件的内部元数据
- **THEN** 字体 MUST 保留上游版权声明记录
- **THEN** 字体 MUST 保留许可证标识与许可证文本链接记录

#### Scenario: 许可证文本随发行包分发

- **WHEN** 用户获取发行包
- **THEN** 发行包 SHALL 包含 SIL OFL 许可证文本
- **THEN** 用户可在安装后的应用资源目录中获取该文本

#### Scenario: 字体来源可追溯

- **WHEN** 审查随包字体的来源记录
- **THEN** 记录包含上游项目、上游版本、上游文件校验值与本地文件校验值
- **THEN** 记录写明该字体是原样格式转换还是经过子集化，以及子集化覆盖的字符集
