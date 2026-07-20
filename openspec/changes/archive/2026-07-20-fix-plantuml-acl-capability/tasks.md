## 1. Capability 配置修复

- [x] 1.1 在 `src-tauri/tauri.conf.json` 的 `app.security.capabilities` 数组中追加 `"plantuml-http-capability"`
- [x] 1.2 将 `src-tauri/capabilities/plantuml-http.json` 的 URL scope 从 `"https://**"` 修复为 `"https://*/*"`（双星号 → 单星号，URLPattern 标准不支持 `**`）
- [x] 1.3 `http:default` 保留在 `plantuml-http.json`——设计验证发现 `http:default` 是开启全部 fetch 子命令（fetch/send/cancel/readBody/cancelBody）的 meta-permission，与 `http:allow-fetch` 的 URL scope 职责不同，两者共存
- [x] 1.4 从 `src-tauri/capabilities/main.json` 移除之前临时添加的 `"http:default"` 权限（放在这里没有 scope 且语义不准确）

## 2. 验证

- [x] 2.1 `cargo build` 通过，构建后的 `capabilities.json` 确认 `plantuml-http-capability` 包含正确的 scope
- [x] 2.2 `npm run build` + `npm test` 全部通过（264 test cases passed）
- [ ] 2.3 在 `tauri dev` 中打开包含 PlantUML 代码块的文档，确认渲染成功、日志包含 `Server responded` 和 `Render succeeded`
- [ ] 2.4 配置一个无效的 HTTP 服务器地址，确认渲染失败时有 `Render failed` 日志
- [x] 2.5 `cargo clean && cargo build` 后 capabilities 内容仍正确
