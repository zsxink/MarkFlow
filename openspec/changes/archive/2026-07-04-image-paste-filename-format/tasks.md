## 1. 修改 generateImageName 函数

- [x] 1.1 在 `generateImageName` 中新增 `'timestamp'` 策略的处理分支：提取文件名主体（`stripExtension`），拼合时间戳，生成 `{basename}-{YYYYMMDD}-{HHmmss}.{ext}` 格式
- [x] 1.2 在 `'timestamp'` 分支中处理 `existingNames` 重复检测，同一秒内同名文件自动递增序号
- [x] 1.3 确认 `'original'` 和 `'sequence'` 策略不受影响

## 2. 处理无扩展名或空文件名的情况

- [x] 2.1 当 `originalName` 为空时，使用 `image` 作为默认文件名主体
- [x] 2.2 当 `originalName` 无扩展名时，默认使用 `.png` 扩展名

## 3. 测试验证

- [x] 3.1 用现有测试运行 `npm test` 确认回归测试通过
- [ ] 3.2 手动验证：启动 dev server，粘贴图片两次检查文件名是否不同
- [ ] 3.3 切换 `original` 策略检查其行为不变
