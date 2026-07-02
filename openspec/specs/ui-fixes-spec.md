# MarkFlow UI 修复规范文档

## 概述

本文档记录了 MarkFlow 开发过程中遇到的 UI 问题及其解决方案，用于避免未来重复犯错。

---

## 1. 侧边栏相关问题

### 1.1 侧边栏收起后留白

**问题**: 点击收起按钮后，侧边栏内容消失但留下了空白区域

**根因**: CSS Grid 使用 `var(--sidebar-w)` 作为固定列宽，收起时 `width: 0` 无法影响 Grid 列宽

**解决方案**:
```css
/* Grid 使用 auto 而非固定宽度 */
#app {
  grid-template-columns: auto 1fr;
}

/* 收起状态 */
.sidebar.collapsed {
  width: 0 !important;
  min-width: 0 !important;
  overflow: hidden;
  border-right: none;
  flex-shrink: 0;
}
```

**教训**: Grid 布局中，`auto` 列会根据内容自动调整大小，适合可折叠的侧边栏

### 1.2 侧边栏收起按钮图标不变

**问题**: 点击收起/展开后，按钮图标保持不变

**根因**: 按钮的 SVG 图标是静态的，需要在事件处理中动态更新

**解决方案**: 在 `toolbar.ts` 的 sidebar-toggle 事件中，根据状态切换 SVG 内容
```typescript
if (isCollapsed) {
  btn.innerHTML = `<svg>...</svg>`; // 收起图标
} else {
  btn.innerHTML = `<svg>...</svg>`; // 展开图标
}
```

**教训**: 图标状态变化需要在事件处理中显式更新 DOM

### 1.3 侧边栏标签页宽度不一致

**问题**: 启动时点击"文件"和"大纲"标签，侧边栏宽度不同

**根因**: 侧边栏没有固定宽度，`auto` 列宽由内容决定，不同标签页内容宽度不同

**解决方案**: 为 `.sidebar` 设置 `min-width` 和默认 `width`
```css
.sidebar {
  min-width: 200px;  /* 刚好容纳底部两个按钮文字不折叠 */
  width: 250px;      /* 默认宽度 = min-width × 1.25 */
}
```

**教训**: 可折叠面板应有固定默认宽度，避免内容变化导致布局跳动。最小宽度应由实际内容（如底部按钮文字）决定。

### 1.4 侧边栏拖拽调整宽度

**实现要点**:
- 使用 `mousedown/mousemove/mouseup` 事件
- 设置最小/最大宽度限制 (200px - 400px)，最小值与 CSS `min-width` 保持一致
- 拖拽时设置 `cursor: col-resize` 和 `user-select: none`
- 使用 inline style 覆盖 CSS 宽度

**注意事项**: 收起状态下不应触发拖拽

### 1.5 侧边栏底部按钮布局

**问题**: "打开文件夹"和"新建文件夹"按钮挤在一起，宽度分配不均

**根因**: `.sidebar-footer` 使用 `gap` 间距，按钮没有均分宽度

**解决方案**: 按钮各占一半宽度
```css
.sidebar-footer {
  display: flex;
  padding: 8px 0;  /* 无 gap，按钮紧贴 */
}

.sidebar-footer-action {
  flex: 1;                    /* 各占一半 */
  justify-content: center;    /* 居中 */
  white-space: nowrap;        /* 防止文字折叠 */
  padding: 6px 8px;
}
```

**教训**: 底部操作栏的按钮应使用 `flex: 1` 均分宽度，配合 `white-space: nowrap` 防止文字换行

---

## 2. 文件操作问题

### 2.1 创建文件/文件夹失败 "Parent directory does not exist"

**问题**: 调用 `create_file` 或 `create_dir` 时报错

**根因**: 原有的 `resolve_path` 函数要求目标路径存在，但新建时目标还不存在

**解决方案**: 新增 `validate_parent_in_workspace` 函数，只验证父目录
```rust
fn validate_parent_in_workspace(path: &Path, state: &State<AppState>) -> Result<(), String> {
    let workspace = state.get_workspace().ok_or("No workspace set")?;
    let workspace = workspace.canonicalize().map_err(|_| "Workspace not found")?;
    let parent = path.parent().ok_or("Invalid path")?;
    let parent = parent.canonicalize().map_err(|_| "Parent directory does not exist")?;
    if !parent.starts_with(&workspace) {
        return Err("Path outside workspace".into());
    }
    if parent.is_symlink() {
        return Err("Symlink not allowed".into());
    }
    Ok(())
}
```

**教训**: 创建操作和读取操作的路径验证逻辑不同，需要区分处理

### 2.2 Windows 路径分隔符问题

**问题**: 文件创建失败，路径解析错误

**根因**: TypeScript 使用 `/` 拼接路径，但 Windows 需要 `\\`

**解决方案**: 使用模板字符串时明确使用 `\\`
```typescript
const fullPath = `${workspacePath}\\${name.trim()}`;
```

**教训**: 跨平台开发时，路径拼接必须考虑操作系统差异

### 2.3 无工作区时的文件创建

**问题**: 没有打开工作区时，创建文件/文件夹功能不可用

**解决方案**: 使用系统对话框作为 fallback
```typescript
if (!workspacePath) {
  const savePath = await save({ defaultPath: name });
  if (savePath) await createFile(savePath, '');
  return;
}
```

**教训**: 功能设计要考虑边界情况，提供合理的 fallback 方案

---

## 3. 输入框问题

### 3.1 浏览器自动填充

**问题**: 新建文件/文件夹对话框的输入框显示浏览器保存的内容

**根因**: 浏览器默认会自动填充表单

**解决方案**: 禁用自动填充属性
```html
<input autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" />
```

**教训**: 桌面应用中的表单需要显式禁用浏览器特性

---

## 4. 模态框显示问题

### 4.1 hidden 属性无效

**问题**: 设置 `modal.hidden = true` 后模态框仍然显示

**根因**: CSS `display: flex` 优先级高于 HTML `hidden` 属性

**解决方案**: 使用 `!important` 提升优先级
```css
.modal-overlay[hidden] {
  display: none !important;
}
```

**教训**: HTML `hidden` 属性的优先级较低，需要用 CSS 显式处理

---

## 5. 内容区域布局

### 5.1 内容区域宽度

**问题**: 内容区域需要在可读性和屏幕利用率之间平衡

**当前配置**:
```css
.editor-container {
  max-width: 1080px;
  padding: 56px 48px 120px;
}

.source-editor {
  max-width: 1080px;
  padding: 56px 48px 120px;
}
```

**教训**: WYSIWYG 和源码模式的宽度配置应保持一致。1080px 是一个在宽屏上充分利用空间、同时保持可读性的合理值。

---

## 6. Tauri 配置问题

### 6.1 插件初始化错误

**问题**: `PluginInitialization("dialog")` 错误

**根因**: `tauri.conf.json` 中 `plugins.dialog: {}` 期望 unit 类型

**解决方案**: 移除 plugins 配置项，仅保留必要的 CSP 设置

**教训**: Tauri v2 插件配置格式严格，空对象 `{}` 不等于无配置

### 6.2 CSP 策略

**当前配置**:
```json
{
  "security": {
    "csp": "default-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' asset: https: data:; script-src 'self'"
  }
}
```

**注意事项**: 
- `style-src 'unsafe-inline'` 允许内联样式
- `font-src data:` 允许 data URI 字体
- `img-src asset:` 允许 Tauri asset 协议

---

## 6. 编辑器统计问题

### 6.1 行数统计不准确

**问题**: 状态栏显示的行数与实际不符

**根因**: `getLineCount()` 使用 `editor.state.doc.textContent` 获取纯文本，然后按 `\n` 分割计数。但 ProseMirror 的 `textContent` 不包含块级元素之间的换行符，所有段落内容被拼接成一行。

**解决方案**: 遍历 ProseMirror 文档的 block 节点计数
```typescript
export function getLineCount(): number {
  if (!editor) return 0;
  let count = 0;
  editor.state.doc.descendants((node) => {
    if (node.isBlock) count++;
  });
  return Math.max(count, 1);
}
```

**教训**: ProseMirror 中，`textContent` 是纯文本拼接，不含结构信息。统计行数应遍历 block 节点而非依赖文本内容。字数统计可以继续使用 `textContent`，但行数必须用节点遍历。

---

## 8. 开发经验总结

### CSS 布局
1. Grid 布局中，`auto` 列宽适合可折叠元素
2. `!important` 用于覆盖 HTML 属性或第三方样式
3. 可折叠面板应有固定默认宽度，最小宽度由内容决定
4. 底部操作栏按钮用 `flex: 1` 均分宽度，`white-space: nowrap` 防折叠

### ProseMirror / Tiptap
1. `textContent` 是纯文本拼接，不含块级元素间的换行符
2. 统计行数必须遍历 block 节点，不能依赖文本分割
3. 字数统计可以用 `textContent`，但要单独处理 CJK 字符

### 路径处理
1. 创建操作验证父目录，读取操作验证目标路径
2. Windows 路径使用 `\\`，跨平台代码需特殊处理
3. 提供无工作区时的 fallback 方案

### 表单输入
1. 桌面应用需禁用浏览器自动填充
2. 使用 `autocomplete="off"` 等属性

### Tauri 开发
1. 插件配置格式严格，参考官方文档
2. CSP 策略需显式配置
3. 系统对话框作为原生 UI 的补充

---

## 9. 测试检查清单

- [ ] 侧边栏收起/展开功能正常，图标正确切换
- [ ] 侧边栏标签页切换宽度一致
- [ ] 侧边栏拖拽调整宽度正常 (200px-400px)
- [ ] 侧边栏底部两个按钮各占一半，文字不折叠
- [ ] 文件/文件夹创建功能正常
- [ ] 输入框无自动填充
- [ ] 模态框显示/隐藏正常
- [ ] 内容区域最大宽度 1080px，侧边距 48px
- [ ] 状态栏行数统计准确（与编辑器实际段落数一致）
- [ ] 状态栏字数统计准确（中英文混合）
- [ ] 路径处理跨平台兼容
