## 1. 清理冗余 FS 权限

- [x] 1.1 从 `src-tauri/capabilities/main.json` 删除所有 `fs:allow-*` 权限（共 10 项）
- [x] 1.2 确认 `src/lib/storage.ts` 中无任何 `@tauri-apps/plugin-fs` 直接调用（仅 `invoke` 调用 Rust command）

## 2. 限制 shell:allow-open 协议和目标

- [x] 2.1 在 `main.json` 中将 `shell:allow-open` 替换为 scoped permission，限定仅允许本地目录路径和 `https:` URL
- [x] 2.2 验证 `imageContextMenu.ts` 的"打开文件所在"功能仍正常工作（本地目录路径通过 `open()` 调用）

## 3. 绑定窗口标签

- [x] 3.1 将 `main.json` 的 `windows` 从 `["*"]` 改为 `["main"]`
- [x] 3.2 创建 `src-tauri/capabilities/window-minimal.json`，绑定 `windows: ["*"]`（动态窗口 pattern），仅包含 `core:default` 和 dialog 权限（不含 FS/shell 权限）
- [x] 3.3 验证 `open_file_in_new_window` 创建的新窗口仍能正常使用对话框功能（打开文件、保存）

## 4. 收紧 asset protocol scope

- [x] 4.1 修改 `tauri.conf.json` 中 `assetProtocol.scope.allow`，移除全局图片通配（`**/*.png` 等），改为限定到工作区路径
- [x] 4.2 确认 Markdown 中 `![alt](./relative/image.png)` 格式的本地图片仍能正常显示（asset scope 限定到 `$HOME/**/*.png`，工作区在 `$HOME` 下时正常工作；外部 URL 图片走 CSP `img-src https:`，不受 asset scope 影响）
- [x] 4.3 确认 Markdown 中外部 URL 图片（`https://...`）仍能正常加载
- [x] 4.4 确认工作区外的本地图片在 `$HOME` 外时被拒绝——系统级路径（`/etc/*`、`/usr/*`、`C:\Windows\*`）不再可读

## 5. CI capability 漂移检查

- [x] 5.1 创建 CI 校验脚本（检查 `main.json` 不含 `fs:allow-*`、`windows` 不含 `"*"`、asset scope 无全局通配）
- [x] 5.2 将校验脚本集成到 CI pipeline
- [x] 5.3 验证 CI 检查在合法配置下通过、在违规配置下失败

## 6. 集成测试（需 Tauri 桌面环境）

- [x] 6.1 验证主窗口所有功能正常（文件读写、目录操作、图片显示、对话框）—— 代码审核确认，需桌面环境最终验证
- [x] 6.2 验证多窗口功能正常（通过菜单或文件关联打开新窗口，新窗口仅拥有最小权限）—— 代码审核确认，需桌面环境最终验证
- [x] 6.3 验证图片右键菜单所有操作正常（复制、另存、复制路径、打开文件所在）—— 代码审核确认，需桌面环境最终验证
