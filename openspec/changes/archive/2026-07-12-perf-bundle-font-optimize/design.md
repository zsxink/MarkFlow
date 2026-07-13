# Design: Bundle & Font Optimization

## Overview

本设计将主入口体积从 ~719KB gzip 降至 500KB 以内，中文字体从 ~33.6MB 降至 4MB 以内，同时确保 Mermaid 和 CodeMirror 语言支持的有效按需加载。

## 1. Mermaid 按需加载

### 方案

将 Mermaid 的 import 从静态改为动态 `import()`，并封装为单例加载器。

**当前状态**: `src/components/editor.prosemirror.render.ts` 中静态 import Mermaid，导致 Mermaid 全量打包进主入口。

**改造方案**:

```typescript
// src/lib/mermaid-lazy.ts
let mermaidPromise: Promise<typeof import('mermaid')> | null = null;

export async function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then(mod => {
      mod.default.initialize({ startOnLoad: false, theme: 'default' });
      return mod;
    });
  }
  return mermaidPromise;
}
```

渲染流程：在 `renderMermaidBlocks` 中调用 `await loadMermaid()`，加载期间显示 spinner 占位。

**影响文件**:
- `src/lib/mermaid-lazy.ts`（新建）
- `src/components/editor.prosemirror.render.ts`（修改 import 路径）

## 2. CodeMirror 语言按需加载

### 方案

建立语言注册表，将语言扩展改为动态 import。启动时仅注册 markdown 等基础语言。

**当前状态**: `src/lib/editor.codemirror.ts` 中静态 import 所有语言扩展（python、rust、go 等），全部打包进主入口。

**改造方案**:

```typescript
// src/lib/codemirror-languages.ts
const LANGUAGE_MAP: Record<string, () => Promise<any>> = {
  javascript: () => import('@codemirror/lang-javascript'),
  typescript: () => import('@codemirror/lang-typescript'),
  python: () => import('@codemirror/lang-python'),
  rust: () => import('@codemirror/lang-rust'),
  // ...
};

const loadedLanguages = new Map<string, any>();

export async function getLanguageExtension(lang: string) {
  if (loadedLanguages.has(lang)) return loadedLanguages.get(lang);
  const loader = LANGUAGE_MAP[lang];
  if (!loader) return null;
  const mod = await loader();
  const ext = mod[lang]();
  loadedLanguages.set(lang, ext);
  return ext;
}
```

**影响文件**:
- `src/lib/codemirror-languages.ts`（新建）
- `src/lib/editor.codemirror.ts`（修改语言注册方式）

## 3. 字体子集化

### 方案

使用 `unicode-range` 实现按需子集化，而非预裁剪字体文件。这样可以保留完整字形数据，浏览器按需请求。

**方案 A（推荐）: CSS unicode-range 分片**

将 Source Han Serif SC 按使用频率分为多个 CSS `@font-face` 声明，每个声明使用 `unicode-range` 限定字符范围：

- **常用汉字**（GB2312，约 6763 字）：单个文件，覆盖 99% 日常使用
- **扩展汉字**：按需加载的大分片
- **英文标点/数字**：复用 Source Serif 4

```css
/* 常用汉字 - 必须加载 */
@font-face {
  font-family: 'Source Han Serif SC';
  src: url('SourceHanSerifSC-Regular-common.woff2') format('woff2');
  unicode-range: U+4E00-9FFF, U+3400-4DBF, ...;
  font-weight: 400;
}
```

**方案 B: 预裁剪字体文件**

使用 `fonttools`（pyftsubset）预裁剪，仅保留 GB2312 字符集。优点是文件更小，缺点是稀有字符无法显示。

**推荐方案 A**：unicode-range 分片兼顾体积和字符覆盖，稀有字符可由浏览器自动回退到系统字体。

**影响文件**:
- `src/assets/fonts/`（新增子集化字体文件）
- `src/styles/fonts.css`（修改 @font-face 声明）

## 4. 消除 storage/sidebar 循环依赖

### 方案

当前 storage 模块和 sidebar 模块存在双向 import，导致 Vite 无法有效 tree-shake。

**改造方案**:
- 引入事件总线（已有 `src/lib/events.ts`），将 sidebar 对 storage 的直接调用改为事件驱动
- storage 模块保持纯净，仅负责数据读写，不依赖 UI 模块
- sidebar 通过事件订阅 storage 变化，解耦双向依赖

**影响文件**:
- `src/lib/storage.ts`（移除对 sidebar 的引用）
- `src/components/sidebar.fileops.ts`（改为事件订阅模式）

## 5. 非首屏按需加载

### 方案

设置对话框、导出功能等非首屏界面改为动态 import：

- `src/components/settings.ts` → `import('./components/settings').then(m => m.showSettings())`
- `src/components/export.ts` → 动态导入导出模块

**影响文件**:
- `src/components/toolbar.ts`（settings 按需加载）
- `src/components/menu.ts`（export 按需加载）

## 6. Bundle Budget

### 方案

使用 `vite-plugin-checker` 或自定义 Vite 插件实现 bundle size 检查：

```typescript
// vite.config.ts
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [
    visualizer({ filename: 'docs/bundle-report.html', gzipSize: true }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['prosemirror-*'],
          'codemirror-core': ['@codemirror/view', '@codemirror/state'],
        }
      }
    }
  }
});
```

CI 中添加 `bundlesize` 或自定义脚本检查产物体积。

## 7. 性能指标基线

改造前后记录以下指标：

| 指标 | 测量方式 |
|------|----------|
| 主入口 JS gzip | `gzip -c dist/*.js \| wc -c` |
| 中文字体总大小 | `du -sh src/assets/fonts/SourceHanSerif*` |
| 冷启动时间 | Tauri dev 启动到编辑器可交互 |
| DOMContentLoaded | Performance API |
| 首次 Mermaid 渲染 | 首次打开含 mermaid 文档的渲染耗时 |
| 安装包大小 | `du -sh src-tauri/target/release/bundle/` |
| 运行内存 | Task Manager / Activity Monitor |
