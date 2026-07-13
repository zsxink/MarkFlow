## Why

最近文件菜单将用户可控的文件路径和名称直接拼接 `innerHTML`，恶意文件名或被篡改的 settings 可注入 HTML 标签/属性，造成 UI 欺骗或数据泄露。文件树已做转义，但最近文件菜单遗漏了此防护。

## What Changes

- `menu.ts`：不再使用 `innerHTML` 拼接模板字符串，改用 `document.createElement` + `textContent` / `dataset` 构建 DOM
- 文件名通过 `textContent` 写入，路径通过 `dataset.path` 赋值
- 全项目审计动态 `innerHTML` 调用，区分静态 SVG/模板与用户可控内容
- 为菜单项点击事件添加事件委托，消除对 `querySelectorAll` 后重新绑定 listener 的依赖
- 在安全边界保留 CSP，不将 CSP 当作转义替代品

## Capabilities

### New Capabilities
- `safe-dom-construction`: 统一的安全 DOM 构建模式，确保所有用户可控内容不进入 `innerHTML`

### Modified Capabilities

<!-- No spec-level behavior changes — this is a security hardening, not a feature change.
     The menu's external behavior (displaying recent files/folders, click to open) stays identical. -->

## Impact

- `src/components/menu.ts`：重构 renderMenu，消除两处 innerHTML 注入点
- 全项目 `innerHTML` 审计文档
