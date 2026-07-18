## 1. 导出基础设施

- [x] 1.1 新建可测试的渲染文档导出模块，生成独立 HTML、Word-compatible HTML、默认文件名和打印文档。
- [x] 1.2 复用原生保存对话框与 `storage.writeFile` 实现 HTML、Word 写盘，以及取消、串行守卫和错误提示。
- [x] 1.3 实现带专用打印样式的隔离浏览器打印流程，且不增加 PDF 依赖。

## 2. 导出入口

- [x] 2.1 在现有工具栏或菜单加入 PDF、Word、HTML 的导出入口并连接到当前 WYSIWYG 渲染 DOM。
- [x] 2.2 补充导出入口样式与键盘/焦点行为，使其符合现有菜单交互。

## 3. 验证与交付

- [x] 3.1 添加导出文件名、HTML/Word 内容、取消、写入失败和打印失败分支的单元测试。
- [x] 3.2 运行 OpenSpec 校验、`npm test` 与 `npm run build`，检查没有新增依赖或 bundle-budget 回退。
- [x] 3.3 按逻辑阶段提交，推送功能分支并创建关联 Issue #8 的 PR。
