# Proposal

## Why

Frontmatter 当前常驻的类型下拉、删除和排序按钮占用了值列宽度，整体边框与新增表单也挤占正文空间。参考用户提供的 Obsidian 属性面板，改为紧凑、可直接编辑的笔记属性行，并将辅助操作移入菜单。

## What Changes

- 用轻量标题和属性行替代大边框表单，未编辑时隐藏输入边框；新增表单按需展开。
- 属性名、普通值及数组标签可就地编辑；提交与取消、键盘跳转保持可靠。
- 属性行从拖动手柄排序，同时提供菜单与键盘排序入口。
- 字段及标签右键菜单提供改名、编辑值、类型修改、移除等操作，省去常驻按钮。
- 保持原始 YAML、只读保护、复杂结构源码回退与正文完整；修复交互涉及的引用键和数组补丁边界。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `frontmatter-visual-editor`: 紧凑展示、就地编辑、上下文操作和可访问排序。

## Impact

影响 `src/components/frontmatterPanel.ts`、编辑区 Frontmatter 样式、`src/lib/frontmatter.ts` 的安全补丁边界及相关测试。复用现有上下文菜单，不增加依赖，不改变 Markdown 文件格式。
