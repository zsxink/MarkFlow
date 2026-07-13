## 1. 修复 menu.ts DOM 注入

- [x] 1.1 将 filesHtml/foldersHtml 字符串拼接替换为 document.createElement + textContent + dataset.path
- [x] 1.2 空状态文本改用 document.createTextNode 或 textContent
- [x] 1.3 标题"最近打开的文件/文件夹"保持不变（静态内容）
- [x] 1.4 事件绑定从 per-item addEventListener 改为容器事件委托（匹配 dataset.path/dataset.type）
- [x] 1.5 验证特殊文件名（`<>"'&` 和 `<img src=x onerror=alert(1)>`）显示为纯文本且可正常打开
- [x] 1.6 确认空状态和正常列表互相切换时无异常

## 2. 全项目 innerHTML 审计

- [x] 2.1 分类审计所有 `innerHTML` 调用：静态模板标记安全，用户可控数据修复
- [x] 2.2 输出审计清单记录在变更记录中

---

## 审计清单

### 已修复
| 文件 | 行号 | 风险 | 状态 |
|------|------|------|------|
| `src/components/menu.ts` | 55 | 文件名/路径拼接 innerHTML | ✅ `createElement` + `textContent` + `dataset` |

### 安全（静态/已转义）
| 文件 | 行号 | 说明 |
|------|------|------|
| `src/components/fileTree.core.ts` | 179 | 清空容器 |
| `src/components/fileTree.core.ts` | 199, 249 | 静态 SVG + `escapeHtml(name)` |
| `src/components/fileTree.inline.ts` | 127, 131 | 静态 SVG |
| `src/components/outline.ts` | 7, 19, 40, 44 | 静态空状态文本 |
| `src/components/toolbar.ts` | 27, 29 | 静态 SVG |
| `src/components/ui/contextMenu.ts` | 51 | `escapeHtml(label)` |
| `src/lib/editor.extensions.ts` | 83 | 静态 SVG |
| `src/lib/editor.init.ts` | 48 | 静态模板 |
| `src/components/ui/dialog.ts` | 73 | 调用方均传静态 HTML |
| `src/components/settings.ts` | 28 | 使用 HTMLElement 路径（appendChild） |
| `src/components/newFileDialog.ts` | — | 静态模板 |
| `src/components/toolbar.ts` | 156 | 静态模板 |

### 低风险观察项（当前安全，模式可改进）
| 文件 | 行号 | 说明 |
|------|------|------|
| `src/components/linkDialog.ts` | 38 | `selectedText` 经 `replace(/"/g,'&quot;')` 后插入 value 属性，当前安全但建议改为 `input.value = selectedText` |
| `src/components/ui/dialog.ts` | 56 | `body` string 类型未经转义入 innerHTML，当前无调用方传用户数据 |
| `src/components/ui/modal.ts` | 38 | `content` string 类型未经转义入 innerHTML，当前无调用方传用户数据 |
| `src/lib/editor.extensions.ts` | 218 | Mermaid SVG 入 innerHTML，由 mermaid 库生成，风险在可信库范围内 |
