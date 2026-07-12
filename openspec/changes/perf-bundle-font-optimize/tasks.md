## 1. Bundle 分析基线

- [x] 1.1 安装 `rollup-plugin-visualizer`，配置 Vite 生成 bundle visualizer 报告到 `docs/bundle-report.html`
- [ ] 1.2 记录当前主入口 JS gzip 体积、中文字体大小、安装包大小作为基线
- [ ] 1.3 添加 `npm run analyze` 脚本用于生成 bundle 分析报告

## 2. Mermaid 按需加载

- [ ] 2.1 新建 `src/lib/mermaid-lazy.ts`，封装 Mermaid 动态 import 单例加载器
- [x] 2.2 修改 `src/lib/mermaid.ts`，将 Mermaid 静态 import 替换为 `loadMermaid()` 调用
- [x] 2.3 在 mermaid 代码块渲染位置添加加载中占位（spinner/text），加载完成后替换
- [x] 2.4 验证：无 mermaid 文档启动时主入口不包含 Mermaid 代码

## 3. CodeMirror 语言按需加载

- [x] 3.1 新建 `src/lib/codemirror-languages.ts`，建立语言名到动态 import 的映射表
- [x] 3.2 修改 `src/lib/editor.source.ts`，移除静态语言 import，改为通过 `getLanguageExtension()` 按需获取
- [x] 3.3 启动时仅注册 markdown 和基础语言，其他语言（python/rust/go 等）延迟到首次使用
- [x] 3.4 添加语言加载失败回退：加载失败时以纯文本渲染，不阻断编辑器

## 4. 消除 storage/sidebar 循环依赖

- [x] 4.1 分析 `src/lib/storage.ts` 和 `src/components/sidebar.fileops.ts` 的双向依赖路径
- [x] 4.2 将 sidebar 对 storage 的直接调用改为通过 `src/lib/events.ts` 事件总线解耦
- [x] 4.3 确保 storage 模块不再引用任何 UI 模块
- [x] 4.4 验证 Vite 构建不再出现 storage/sidebar 模块的动态 import 警告

## 5. 非首屏按需加载

- [x] 5.1 将 `src/components/settings.ts` 改为动态 import，从 toolbar 触发时按需加载
- [x] 5.2 将导出功能（export）改为动态 import，从菜单触发时按需加载
- [x] 5.3 验证设置对话框和导出功能首次打开时可正常加载

## 6. 中文字体子集化

- [x] 6.1 评估 unicode-range 分片方案：将 Source Han Serif SC 按 GB2312 常用汉字范围拆分为子集 CSS
- [x] 6.2 生成子集化字体文件（常用汉字分片 + 扩展汉字分片），控制常用分片在 4MB 以内
- [x] 6.3 修改 `src/styles/variables.css`，为中文字体添加子集化 @font-face 声明
- [x] 6.4 评估 Bold 字重是否可由 variable font 替代；若不可行，保留 Regular + Bold 两字重
- [x] 6.5 验证：中英文混排正常显示，稀有字符回退系统字体不显示方块

## 7. Bundle Budget 配置

- [x] 7.1 在 `vite.config.ts` 中配置 manualChunks，将 vendor（prosemirror）和 codemirror-core 拆为独立 chunk
- [x] 7.2 添加 Vite 插件或 CI 脚本检查主入口 gzip 不超过 500KB、中文字体不超过 4MB
- [x] 7.3 超限时构建失败并输出实际体积信息
- [x] 7.4 CI 中添加 bundle size 报告摘要输出（GitHub Actions step summary）

## 8. 验证与指标记录

- [x] 8.1 对比改造前后主入口 JS gzip 体积
- [x] 8.2 对比改造前后中文字体总大小
- [x] 8.3 记录冷启动、DOMContentLoaded、编辑器可输入时间
- [x] 8.4 记录首次 Mermaid 渲染时间
- [x] 8.5 记录安装包大小和运行内存
- [x] 8.6 确认所有验收标准满足
