# MarkFlow 中文示例

这是一份用于测试 **MarkFlow** 的 Markdown 示例文档。

![MarkFlow 标识](../assets/markflow-wordmark.png)

## 基础格式

- 无序列表项
- 支持 **加粗**、*斜体* 和 ~~删除线~~
- 支持 `行内代码`

1. 第一项有序列表
2. 第二项有序列表
3. 第三项有序列表

> 这是一段引用
>
> 可用于验证块级引用样式是否正常。

---

## 任务列表

- [x] 已实现核心 Markdown 编辑器

- [x] 已增加图片支持

- [ ] 已启用 Mermaid 渲染

- [ ] 后续补充更多示例文档

## 表格

| 功能 | 状态 | 说明 |
| --- | --- | --- |
| 所见即所得编辑 | 已完成 | 主要编辑体验 |
| 源码模式 | 已完成 | 直接编辑 Markdown |
| Mermaid 图表 | 已完成 | 预览渲染，保存源码 |

### 表格示例

| 模块 | 优先级 | 负责人 | 备注 |
| --- | --- | --- | --- |
| 编辑器 | 高 | Ryan | 当前主要开发区域 |
| 文件树 | 中 | MarkFlow | 支持拖拽与重命名 |
| Mermaid | 高 | Claude | 预览渲染与源码编辑 |
| 示例文档 | 低 | 文档 | 用于展示功能效果 |

## 代码块

```ts
function greet(name: string) {
  return `你好，${name}`;
}

console.log(greet('MarkFlow'));
```

## Mermaid 示例

```mermaid
graph TD
  A[打开文档] --> B[编辑 Markdown]
  B --> C{是否插入 Mermaid}
  C -->|是| D[渲染图表]
  C -->|否| E[继续编辑]
  D --> F[保存源码]
  E --> F
```

## 第二个 Mermaid 示例

```mermaid
sequenceDiagram
  participant U as 用户
  participant E as 编辑器
  participant S as 存储

  U->>E: 输入 Mermaid 源码
  U->>E: 点击图表进入编辑
  E->>E: 切换当前区块到源码编辑态
  U->>E: 修改后点击确认
  E->>S: 保存原始 Markdown 源码
```

## PlantUML 示例

```plantuml
@startuml
Alice -> Bob: 认证请求
Bob --> Alice: 认证响应

Alice -> Bob: 再次请求
Bob --> Alice: 再次响应
@enduml
```

```plantuml
@startuml
start
:用户打开文档;
if (是否有 PlantUML 配置?) then (是)
  :渲染图表;
else (否)
  :显示代码块;
endif
stop
@enduml
```

## 链接

支持 [内联链接](https://example.com) 和 [带标题的链接](https://example.com "示例标题")。

裸 URL 如 https://example.com 会被自动识别装饰，Ctrl+单击或 Cmd+单击即可直接打开。

## 图片

除上文 logo 外，MarkFlow 支持在文档任意位置插入图片：

![MarkFlow 标识](../assets/markflow-wordmark.png)

## 结束

感谢使用 MarkFlow。