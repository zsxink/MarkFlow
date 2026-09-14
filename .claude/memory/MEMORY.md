# MarkFlow 项目记忆索引

## 架构
- [前端架构代码地图](architecture-frontend.md) — Tiptap/ProseMirror + 原生 DOM，无框架，双模式编辑器
- [后端架构代码地图](architecture-backend.md) — Tauri v2 Rust 后端，文件系统/窗口/IPC 命令清单

## 调试经验
- [代码块行号显示异常](debugging-code-block-line-numbers.md) — flex-grow 缺失导致 clientWidth 不可信 + charsPerLine 必须 floor
- [源码编辑器布局问题](debugging-source-editor-layout.md) — hidden 属性被覆盖、gutter 定位、空 div 高度为 0

## 流程规范
- [工作流合规](workflow-compliance.md) — 必须遵守分支/PR/commit 规范，不能直接改 main

## 项目决策
- [路线图方向：忽略重构主线](roadmap-direction-ignore-refactor.md) — 下一阶段聚焦全新五方向（优化/增强/主题/图床/修复），不把 #254/#255 当主线
- [源码模式自动换行](source-mode-line-wrapping.md) — 源码模式跟随设置的软换行（CodeMirror lineWrapping）
- [增强方向：KaTeX + 表格 + frontmatter](roadmap-enhancement-katex-table-frontmatter.md) — 增强主攻集合
- [主题方向：CSS 文件即主题](roadmap-theme-css-files.md) — 自定义主题编辑器 + 导入导出，CSS 文件为颗粒
- [优化方向：用户感知+窄架构](roadmap-optimization-boundary.md) — 优化边界，不碰重构主线
- [图床方向：PicGo/PicList 本地服务](roadmap-imagehost-picgo-server.md) — 对接 36677 /upload，不内置协议

## 踩坑记录
- [tiptap-markdown 序列化器限制](troubleshooting-tiptap-markdown-serializer.md) — HTMLNode fallback 陷阱 + defense-in-depth 策略
- [表格输入规则 InputRule 陷阱](table-wysiwyg-input-rule.md) — 匹配文本只含当前段落、resolve(start) 与 node start、空续段触发时机
- [表格 WYSIWYG 交互交付陷阱](table-wysiwyg-interaction.md) — TableView 类型约束、tables.css 未引入 selectedCell 需自补、align 解析路径、hidden 显式 display
