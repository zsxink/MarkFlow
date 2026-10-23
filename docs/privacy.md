# 隐私说明

MarkFlow 是一个本地优先的 Markdown 编辑器。这份说明写清楚应用在你的电脑上
读写什么、什么情况下会联网，以及联网时到底发出去了什么。它对应
`docs/privacy.en.md`，两版内容一致。

## 一句话总结

MarkFlow 不上报使用数据、不做自动更新检查、不联网收集任何信息。唯一的对外
网络行为是**你自己配置**的 PlantUML 服务器，以及你主动打开的网络图片。

## 本地存储

MarkFlow 不把文档存到云端。你打开的每个文件都是你磁盘上的真实文件，保存时
直接写回原路径。

除文档本身外，应用还会在本地保存少量辅助数据：

| 内容 | 位置（macOS） | 位置（Windows） | 位置（Linux） |
| --- | --- | --- | --- |
| 设置（`settings.json`），含最近打开的文件与文件夹列表 | `~/Library/Application Support/MarkFlow/` | `%APPDATA%\MarkFlow\` | `~/.config/MarkFlow/` |
| 日志（按天滚动，保留 7 天） | `~/Library/Application Support/MarkFlow/logs/` | `%APPDATA%\MarkFlow\logs\` | `~/.config/MarkFlow/logs/` |
| 粘贴图片的暂存文件 | `~/Library/Application Support/MarkFlow/pending-images/` | `%LOCALAPPDATA%\MarkFlow\pending-images\` | `~/.local/share/MarkFlow/pending-images/` |

说明：

- **最近打开列表**只保存文件与文件夹的绝对路径，最多 10 条，可在应用菜单里
  一键清除。
- **日志**用于排查问题，记录操作与错误信息；其中的 URL 查询参数会被脱敏为
  `<redacted>`，7 天前的日志在启动时自动删除。日志不会上传到任何服务器。
- **暂存图片**是你粘贴进文档的图片在正式落盘前的临时副本，保存文档后会转为
  文档旁的正式图片文件。应用崩溃时它们会留在这里，下次启动时清理。

## 没有遥测

MarkFlow：

- **不收集**使用统计、崩溃报告、功能埋点或任何设备标识；
- **不包含**第三方分析 SDK（无 Sentry、Google Analytics、BugSnag 等）；
- **不做**自动更新检查——没有启动时或定时的版本查询请求；
- **不访问**应用自身的任何服务器——本项目没有后端服务。

应用只在本地写日志文件，日志不出机器。

## 联网行为

MarkFlow 只有两类网络请求，两类都由你主动触发。

### 1. PlantUML 图表（仅在你自己配置服务器后）

PlantUML 服务器地址默认为空。**地址为空时，MarkFlow 不会为 PlantUML 代码块
发出任何网络请求**，图表就以普通代码块显示。

你在「设置 → PlantUML」填入服务器地址后，MarkFlow 会把该 `plantuml` 代码块
的**源码文本**发送到那个地址，并取回渲染好的 SVG。具体来说：

- 发送的内容只有该图表的源码，不包含文档的其他部分、文件路径或任何元数据；
- 请求的目标完全由你填写的地址决定，MarkFlow 不内置、也不推荐任何服务器；
- 若你填的是公共服务器（如 `plantuml.com`），图表源码会离开你的机器并落到
  第三方运营方手里，适用对方的隐私政策；
- 若内容是敏感的，请自建 PlantUML 服务（例如本地 Docker 或内网实例），把
  地址指向它。

设置面板内也有同样的警告提示，两者一致。

### 2. 网络图片

Markdown 里的 `![](https://...)` 远程图片需要下载才能显示。MarkFlow 会在
渲染到视口时向图片所在的地址发起请求，仅此而已。把图片改为本地路径或关闭
文档中的远程图片引用即可避免这类请求。

## 导出文件

导出的 HTML 会把字体以 base64 内联进文件，因此导出的 HTML 完全离线可用、
不含任何外部请求。导出的 PDF、Word（`.docx`）同理，不引用远端资源。

导出文件写到哪个位置由你在保存对话框中选择，MarkFlow 不会自动外传。

## 权限

MarkFlow 通过 Tauri 的能力（capability）配置限定自身能做什么：

- 文件读写通过你选择的路径，或你已打开的文件夹；
- HTTP 请求只对 `http://` 与 `https://` 开放，且 PlantUML 与远程图片之外没有
  调用点；
- 没有 shell 执行、没有任意文件系统遍历权限。

## 变更与联系

这份说明随版本更新。若对数据处理有疑问，或发现说明与实际行为不符，请在
<https://github.com/zsxink/MarkFlow/issues> 提出 issue。

相关文档：

- [第三方许可证清单](../THIRD-PARTY-NOTICES.md)
- [字体授权记录](../third-party/fonts/PROVENANCE.md)
- [随包素材授权记录](../third-party/assets/PROVENANCE.md)
- [主许可证](../LICENSE)
