# Tasks

## 1. 收紧 WYSIWYG 表格单元格内边距

- [x] 1.1 调整 `.ProseMirror th, .ProseMirror td` 的上下 padding 为更紧凑且一致的数值，保留水平 padding；检查 CSS 确认表格外部 margin 与段落样式未改动

## 2. 验证表格布局变更

- [x] 2.1 运行 `npm run build`、`npm test` 和 `npm run validate:openspec`，并检查最终 diff 确认变更仅影响表格单元格内部上下间距与对应规范
