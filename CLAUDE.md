# MarkFlow

Tauri v2 (Rust) + TypeScript + Vite 桌面 Markdown 编辑器。
编辑器引擎：ProseMirror (WYSIWYG) + CodeMirror (源码模式)。

## 构建与测试

```bash
npm run dev          # 启动 Vite 开发服务器
npm run build        # tsc + vite build
npm test             # vitest run
npm run tauri dev    # 启动 Tauri 开发环境
```

## 调试规则

- **先查运行日志再改代码**。日志路径：`C:/Users/xian/AppData/Roaming/MarkFlow/logs`
- 布局/样式问题先检查 CSS，不要跳过 CSS 直接修 JS
- 踩坑记录和详细教训见 `.claude/memory/`
