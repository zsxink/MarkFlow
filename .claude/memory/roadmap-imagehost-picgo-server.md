---
name: roadmap-imagehost-picgo-server
description: 图床方向定档——对接 PicGo/PicList 本地服务，不内置协议
metadata:
  type: project
---

2026-08-30 路线图讨论，图床方向定档：**使用 PicGo/PicList 的服务，不内置图床协议**（用户原话）。支持「选择图片插入时直接上传」+「右键上传本地图片」两条路径。

**技术验证结论**（调研确认）：
- 唯一现实集成路径 = 调用用户已安装的 PicGo(≥2.2.0)/PicList 桌面 App 的**本地 HTTP 服务** `http://127.0.0.1:36677/upload`。
- 协议：`POST /upload`，body `{"list":[绝对路径]}`；或 **`multipart/form-data`（字段 `files`）传给 PicGo ≥2.4/PicList/core 3.x** —— 推荐用 multipart 避免 Tauri 路径可见性问题。
- 响应：`{"success":true,"result":[url]}`。CORS `*`，前端 fetch 可直接调用。本地默认**无鉴权**，凭据全由 PicGo 持有，MarkFlow 零持密。
- 端口可变（36578…）、有 `/heartbeat` 探活 → 端口做成可配置 + 启动检测 + 未安装引导。
- **不要** bundle `picgo` npm 库进 sidecar（工程重、仍需自实现图床插件协议，与目标冲突）。
- 兜底：无 PicGo 用户的「自定义 HTTP 图床 API」配置（multipart POST），低成本。

**How to apply:** 图床方案以此为准：前端 fetch 或 Rust reqwest 调本地 36677 服务；先做「服务检测/引导 + multipart 上传 + URL 回填替换本地引用」，再做右键上传。相关：[[roadmap-direction-ignore-refactor]]