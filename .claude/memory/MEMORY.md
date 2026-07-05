# MarkFlow 项目记忆索引

## 架构
- [前端架构代码地图](architecture-frontend.md) — Tiptap/ProseMirror + 原生 DOM，无框架，双模式编辑器
- [后端架构代码地图](architecture-backend.md) — Tauri v2 Rust 后端，文件系统/窗口/IPC 命令清单

## 调试经验
- [代码块行号显示异常](debugging-code-block-line-numbers.md) — flex-grow 缺失导致 clientWidth 不可信 + charsPerLine 必须 floor
- [源码编辑器布局问题](debugging-source-editor-layout.md) — hidden 属性被覆盖、gutter 定位、空 div 高度为 0

## 流程规范
- [工作流合规](workflow-compliance.md) — 必须遵守分支/PR/commit 规范，不能直接改 main

## 踩坑记录
- [tiptap-markdown 序列化器限制](troubleshooting-tiptap-markdown-serializer.md) — HTMLNode fallback 陷阱 + defense-in-depth 策略
