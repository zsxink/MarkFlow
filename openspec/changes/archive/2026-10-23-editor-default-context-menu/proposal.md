# Proposal

## Why

普通段落和源码编辑区目前拦截了系统右键菜单，却没有提供可用的编辑操作；现有专用菜单也使用了分散的视觉样式。为编辑区域补上统一的编辑菜单，并让所有应用自定义右键菜单采用用户提供的轻量原生风格。

## What Changes

- 为所见即所得和源码编辑区域提供链接、文本格式、段落/插入、剪切、复制、粘贴和全选操作。
- 在应用中未被节点专用菜单处理的区域提供适用的默认编辑操作；表格、图片及 Mermaid/PlantUML 导出菜单继续由各自现有处理器独占。
- 统一右键菜单的圆角、间距、分隔线、焦点/悬停和禁用状态，并支持嵌套子菜单。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `context-menu`: 增加默认编辑菜单分流、子菜单交互与统一视觉呈现要求。

## Impact

- `src/components/ui/contextMenu.ts`、`src/components/editorContextMenu.ts`、`src/main.ts`、`src/styles/components.css`
- 现有表格、文件树、Frontmatter、图片和图表菜单继续复用统一菜单工厂。
