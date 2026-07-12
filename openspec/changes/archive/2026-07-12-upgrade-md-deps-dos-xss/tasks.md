## 1. 依赖升级

- [x] 1.1 尝试升级 `@tiptap/*` 系列包至最新 minor/patch 版本，使 `markdown-it` 和 `linkify-it` 随之升级到安全版本
- [x] 1.2 检查 `npm explain markdown-it linkify-it` 确认版本已修复 GHSA-22p9-wv53-3rq4 和 GHSA-6v5v-wf23-fmfq
- [x] 1.3 若上游未发布兼容版本，对 `markdown-it` 和 `linkify-it` 添加 `overrides`（附注释说明移除条件）
- [x] 1.4 升级 `dompurify` 至 `>=3.4.7`（直接升级或通过 `overrides` 覆盖）
- [x] 1.5 执行 `npm audit --omit=dev` 确认 linkify-it、markdown-it、dompurify 相关 high/critical 漏洞已消除

## 2. 兼容性验证

- [x] 2.1 执行 `npm test` 确认所有现有测试通过
- [ ] 2.2 手动验证 Markdown 渲染（标题、列表、代码块、表格、链接、图片、Mermaid）无回归
- [x] 2.3 记录升级前后 Markdown 解析的可见差异（如有）

## 3. 回归测试

- [x] 3.1 新增超长链接文本解析测试（10000+ 字符 URL），验证主线程不阻塞
- [x] 3.2 新增 smartquotes DoS 输入测试（大量 smartquotes 特殊字符），验证主线程不阻塞
- [x] 3.3 新增 SVG/HTML 清洗回归测试，验证 `dompurify` XSS 防护有效
- [x] 3.4 执行 `npm test` 确认新增测试全部通过

## 4. CI 审计步骤

- [x] 4.1 在 `.github/workflows/` 中新增或修改 workflow，添加 `npm audit --omit=dev --audit-level=high` 步骤
- [x] 4.2 验证 CI 步骤在含 high/critical 漏洞时失败、在无 high/critical 漏洞时通过
- [x] 4.3 验证 moderate 级别漏洞不阻断 CI
