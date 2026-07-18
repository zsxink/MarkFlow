## MODIFIED Requirements

### Requirement: Rendered HTML export source
系统 SHALL 以当前 WYSIWYG 编辑器的渲染 HTML 为三种导出的共同内容来源，并保留其中已渲染的图片、图表和必要的样式。本地图片 SHALL 在导出时转换为可移植的 data URI 格式。

#### Scenario: 文档含渲染内容
- **WHEN** 用户导出含图片、图表或格式化文本的当前文档
- **THEN** HTML 与 Word 导出 SHALL 包含当前渲染结果及其必要内联样式

#### Scenario: 文档含本地图片
- **WHEN** 用户导出含本地图片（asset 协议 URL）的文档
- **THEN** 导出文件中的图片 SHALL 以 data URI 格式内联，确保在应用外可正常显示

#### Scenario: 源码模式下导出
- **WHEN** 用户在源码（CodeMirror）模式下触发导出
- **THEN** 系统 SHALL 先将最新源码内容同步到 WYSIWYG 编辑器，再执行导出

### Requirement: Browser-print PDF export
系统 SHALL 使用浏览器打印流程承载当前渲染 HTML 以供用户另存为 PDF，并应用专用打印样式；实现 MUST NOT 引入 jsPDF、pdf-lib 或其他 PDF 生成依赖。打印流程 SHALL 无竞态条件。

#### Scenario: 触发 PDF 导出
- **WHEN** 用户选择 PDF 导出
- **THEN** 系统 SHALL 打开包含渲染文档与打印样式的打印流程并触发浏览器打印

#### Scenario: PDF 打印流程不可用
- **WHEN** 浏览器无法创建或打印导出文档
- **THEN** 系统 SHALL 显示用户可理解的导出失败提示

#### Scenario: PDF 并发导出保护
- **WHEN** 用户在 PDF 导出过程中再次点击导出
- **THEN** 系统 SHALL 忽略重复请求，直到前一次导出完成
