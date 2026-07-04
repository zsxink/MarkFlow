## 1. 字体文件下载与导入

- [x] 1.1 下载 Source Serif 4 (Regular + Bold) 的 woff2 文件
- [x] 1.2 下载 Source Han Serif SC (Regular + Bold) 的 woff2 文件
- [x] 1.3 将字体文件放入 `src/assets/fonts/` 目录
- [x] 1.4 确认字体 LICENSE（OFL）文件一并放入 assets/fonts/

## 2. CSS @font-face 声明

- [x] 2.1 在 `src/styles/variables.css` 中添加 Source Serif 4 的 @font-face 声明（Regular + Italic + Bold + BoldItalic）
- [x] 2.2 添加 Source Han Serif SC 的 @font-face 声明（Regular + Bold）
- [x] 2.3 使用 font-display: block 策略

## 3. 更新字体栈

- [x] 3.1 修改 `src/styles/variables.css` 中 `--font-body` 为 `'Source Serif 4', 'PingFang SC', 'Source Han Serif SC', 'Microsoft YaHei', serif`
- [x] 3.2 确认 ProseMirror 编辑器区域正确继承 `--font-body`（已有 `font-family: var(--font-body)`）
- [x] 3.3 检查其他使用 `--font-body` 的地方，确保正确应用

## 4. 验证与调试

- [x] 4.1 构建通过，字体文件正确打包到 dist/assets/
- [x] 4.2 手动确认中英文混排显示协调（用户已确认正常）
- [x] 4.3 手动确认粗体使用正确字重（用户已确认正常）
- [x] 4.4 确认构建产物中包含字体文件，不依赖网络