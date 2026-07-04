## 1. 提取 dialog-system 规范到主 specs

- [x] 1.1 阅读 `src/components/toolbar.ts` 中 `showImageInsertDialog()`（插入图片对话框）、`src/components/linkDialog.ts`（链接对话框）、`src/components/newFileDialog.ts`（新建文件对话框），以及 `src/styles/main.css` 中对应的 CSS 类（`.modal-overlay`、`.modal`、`.modal-header`、`.modal-close`、`.btn-primary`、`.btn-secondary`、`.newfile-input`、`.image-insert-dialog`），归纳共同的结构、样式和交互模式
- [x] 1.2 在 `openspec/specs/dialog-system/spec.md` 中编写统一的对话框系统规范，文档化以下内容：
  - DOM 结构模板（overlay → modal → header + content + footer）
  - CSS 样式变量与类名约定（overlay 遮罩层、modal 卡片、标题栏、关闭按钮、primary/secondary 按钮、输入框）
  - 所有关闭方式（✕按钮、取消按钮、遮罩层点击、Escape）
  - 宽度变体（360px 简单输入 / 480px 图片插入 / 520px 外部冲突）
  - 对话框创建模式（innerHTML + 事件绑定 + hidden 切换）
- [x] 1.3 在 `index.html` 中为未保存提示对话框添加占位 `<div id="unsaved-modal" class="modal-overlay" hidden>`

## 2. 创建未保存提示对话框的 CSS 样式

- [x] 2.1 在 `src/styles/main.css` 中新增 `.unsaved-modal .modal { width: 360px; }` 样式（与 `newfile-modal` 同宽）
- [x] 2.2 确认 `.modal-overlay` / `.modal` / `.modal-header` / `.modal-close` / `.btn-primary` / `.btn-secondary` 的通用样式已覆盖对话框需求，无需额外声明

## 3. 创建未保存提示对话框组件

- [x] 3.1 在 `src/components/unsavedDialog.ts` 中实现 `showUnsavedDialog(destroyFn: () => Promise<void>)` 函数：
  - 获取 `#unsaved-modal` overlay 元素
  - 构造 modal DOM：标题「未保存的更改」、正文「当前文件有未保存的更改。」、底部三按钮「取消」(btn-secondary)、「不保存」(btn-secondary)、「保存」(btn-primary)
  - 绑定关闭事件：✕ 关闭、遮罩层点击关闭、Escape 键关闭（均取消操作）
- [x] 3.2 实现「保存」逻辑：点击后调用 `saveActiveDocument({ interactive: true })`，成功则调用 `destroyFn()` 关闭窗口，失败则保持窗口打开
- [x] 3.3 实现「不保存」逻辑：点击后直接调用 `destroyFn()` 关闭窗口，不触发保存
- [x] 3.4 实现「取消」逻辑：点击「取消」按钮或 Escape 键或 ✕ 按钮或遮罩层时，设置 `overlay.hidden = true`，窗口保持打开
- [x] 3.5 绑定 Enter 键监听：聚焦对话框时按 Enter 触发「保存」操作

## 6. 确认文件操作前的未保存提示
    
- [x] 6.1 将 `confirmDocumentTransition()` 中的 `window.confirm()` 对话框替换为样式化模态对话框（复用 `unsaved-modal` 遮罩层），使用统一的 `.modal` / `.modal-header` / `.btn-primary` / `.btn-secondary` 样式
- [x] 6.2 修正工具栏「打开文件」按钮顺序：将脏状态检查移到 OS 文件对话框之前（原来在对话框之后检查，顺序错误）
- [x] 6.3 修正工具栏「打开文件夹」按钮顺序：将脏状态检查移到 OS 文件夹选择对话框之前
- [x] 6.4 修正侧边栏「打开文件夹」按钮顺序：将脏状态检查移到 OS 文件夹选择对话框之前
- [x] 6.5 修正右键菜单「打开文件」和「打开文件夹」的脏状态检查顺序
- [x] 6.6 为键盘快捷键 `Ctrl+O` 添加 `confirmDocumentTransition()` 脏状态检查（之前遗漏了）
- [x] 6.7 运行 `npm run build` 确认 TypeScript 无编译错误

## 4. 集成 Tauri 关闭拦截与弹出逻辑 (修复: Rust 端 on_window_event)

- [x] 4.1 在 `src-tauri/src/lib.rs` 的 `app.run()` 闭包中，通过 `RunEvent::WindowEvent` 匹配 `WindowEvent::CloseRequested`，调用 `api.prevent_close()` 阻止关闭，然后 `window.emit("close-requested", ())` 发送自定义事件到前端
- [x] 4.2 在 `src/main.ts` 中改用 `listen('close-requested', ...)` 接收 Rust 端事件：
  - clean → 调用 `getCurrentWebviewWindow().destroy()` 直接关闭
  - dirty → 弹出 `showUnsavedDialog(destroyFn)` 传入 destroy 回调
- [x] 4.3 Rust 端的 `RunEvent::WindowEvent` 匹配所有窗口（包括动态创建的新窗口），确保多窗口场景正常工作
- [x] 4.4 `beforeunload` 的窗口位置保存逻辑保持独立，与 close-requested 不冲突

## 5. 清理与验证

- [ ] 5.1 验证对话框在四种关闭方式下行为正确：✕ 按钮、遮罩层点击、Escape 键、「取消」按钮均取消操作不关闭窗口
- [ ] 5.2 验证「保存」操作的边界情况：
  - 保存成功后窗口关闭
  - 保存失败（如磁盘满、权限不足）时窗口保持打开，toast 显示错误信息
- [ ] 5.3 验证「不保存」操作：直接关闭窗口，不触发保存
- [ ] 5.4 验证自动保存激活时，自动保存刚执行完（dirty=false）关闭窗口不弹提示
- [ ] 5.5 验证对话框在浅色/深色/护眼三种主题下视觉正常
- [ ] 5.6 验证现有对话框（插入图片、链接、新建文件/文件夹）不受本次修改影响
- [x] 5.7 运行 `npm run build` 确保无 TypeScript 编译错误
