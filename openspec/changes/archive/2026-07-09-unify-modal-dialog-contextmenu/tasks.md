## 1. 核心工厂函数

- [ ] 1.1 创建 `src/components/ui/dialog.ts` — 实现 `showDialog()` 函数（Promise 返回、backdrop 关闭、Escape 关闭、X 按钮、focus trap、overlay 自动创建与移除）
- [ ] 1.2 创建 `src/components/ui/modal.ts` — 实现 `showModal()` 函数（backdrop 关闭、Escape 关闭、scroll lock、overlay 自动创建与移除）
- [ ] 1.3 创建 `src/components/ui/contextMenu.ts` — 实现 `showContextMenuStatic()` 函数（定位、`clampMenuPosition` 复用、外部点击关闭）

## 2. 迁移简单对话框

- [ ] 2.1 迁移 `confirmDocumentTransition()`（sidebar.ts）— 使用 `showDialog` 替换内联 innerHTML，接口签名不变
- [ ] 2.2 迁移 `showExternalConflictDialog()`（sidebar.conflict.ts）— 使用 `showDialog` 替换 createElement，补充缺少的 Escape/backdrop 关闭
- [ ] 2.3 迁移 `showExternalDeletionDialog()`（sidebar.conflict.ts）— 使用 `showDialog` 替换 createElement
- [ ] 2.4 迁移 `showUnsavedDialog()`（unsavedDialog.ts）— 使用 `showDialog` 替换，删除 `src/components/unsavedDialog.ts`

## 3. 迁移内容型弹窗

- [ ] 3.1 迁移 `initSettings()`（settings.ts）— 使用 `showModal()` 替换内联 innerHTML + overlay 管理
- [ ] 3.2 迁移 `showNewFileDialog()`（newFileDialog.ts）— 使用 `showModal()` 替换内联 innerHTML + overlay 管理
- [ ] 3.3 迁移 `showLinkDialog()`（linkDialog.ts）— 使用 `showModal()` 替换内联 innerHTML + overlay 管理
- [ ] 3.4 迁移 `showImageInsertDialog()`（toolbar.ts）— 使用 `showModal()` 替换内联 innerHTML + overlay 管理

## 4. 迁移 ContextMenu

- [ ] 4.1 迁移 `showContextMenu()`（contextMenu.ts）— 使用 `showContextMenuStatic()` 替换手动定位/事件
- [ ] 4.2 迁移 `showImageContextMenu()`（imageContextMenu.ts）— 使用 `showContextMenuStatic()` 替换手动定位/事件
- [ ] 4.3 迁移 Mermaid ContextMenu — 使用 `showContextMenuStatic()` 替换手动定位/事件

## 5. 清理 HTML 骨架

- [ ] 5.1 从 `index.html` 移除 `#settings-modal`、`#newfile-modal`、`#image-modal`、`#link-modal`、`#unsaved-modal` 的 `<div class="modal-overlay">` 骨架元素
- [ ] 5.2 确认 CSS `.modal-overlay[hidden]` 规则对新动态创建的 overlay 仍有效
- [ ] 5.3 更新引用旧骨架元素的代码路径

## 6. 验证

- [ ] 6.1 运行 `npm test` 确保全部通过
- [ ] 6.2 手动验证各弹窗功能正常（设置、新建文件、图片、链接、未保存提示）
- [ ] 6.3 手动验证各 ContextMenu 功能正常（文件树、图片、Mermaid）
- [ ] 6.4 手动验证交互行为一致（Escape 关闭、backdrop 关闭、focus 管理）
