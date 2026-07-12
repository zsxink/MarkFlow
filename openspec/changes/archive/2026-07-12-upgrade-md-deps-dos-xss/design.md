## Context

MarkFlow 使用 Tiptap (ProseMirror) 作为 WYSIWYG 编辑器引擎，其 `prosemirror-markdown` 依赖链最终引入 `markdown-it@14.1.1` 和 `linkify-it@5.0.0`。`markdown-it` 的 smartquotes 规则和 `linkify-it` 的链接扫描均为二次复杂度，可被恶意构造的长输入拖垮主线程。`dompurify@<=3.4.10` 存在多项 XSS/配置污染漏洞。

依赖链：`@tiptap/starter-kit` → `@tiptap/pm` → `prosemirror-markdown` → `markdown-it` → `linkify-it`

CI 当前仅有 `auto-pr.yml` 和 `release.yml`，无生产依赖审计步骤。

## Goals / Non-Goals

**Goals:**
- 消除 `npm audit --omit=dev` 中 high/critical 级别漏洞
- 确保恶意 Markdown 输入不会造成明显主线程长时间阻塞
- CI 自动执行生产依赖漏洞审计

**Non-Goals:**
- 重构 Markdown 渲染架构（如迁移到其他解析器）
- 修复所有 non-high/critical 级别漏洞
- 升级所有非安全相关的过期依赖

## Decisions

### D1: 升级策略 — 优先升级直接上游依赖

**选择**：优先尝试升级 `@tiptap/starter-kit` 和相关 tiptap 包，使其依赖的 `markdown-it` 和间接依赖自动升级到安全版本。若上游未发布兼容版本，则对 `markdown-it` 和 `dompurify` 使用 `overrides`。

**理由**：`linkify-it` 是 `markdown-it` 的依赖，升级 `markdown-it` 通常会带动 `linkify-it` 升级。`dompurify` 是间接依赖，直接覆盖最直接。

**备选方案**：
- 仅用 `overrides` 覆盖所有漏洞包 — 更快但可能引入兼容性问题
- fork 并修补 — 成本过高，不适合安全补丁场景

### D2: CI 审计步骤

**选择**：在现有 CI 中新增 `npm audit --omit=dev --audit-level=high` 步骤，阻断含 high/critical 漏洞的 PR 合入。

**理由**：`--audit-level=high` 仅阻断 high 和 critical，避免 moderate 级别阻塞开发。使用 `--omit=dev` 只审计生产依赖。

**备选方案**：
- 使用 `audit-ci` 第三方工具 — 增加依赖，收益有限
- 在 `package.json` 中用 `overrides` 配置 `audit` 行为 — 不够灵活

### D3: 回归测试策略

**选择**：新增针对恶意输入的回归测试，覆盖：
- 超长链接文本（触发 `linkify-it` 二次复杂度）
- smartquotes 特殊输入（触发 `markdown-it` smartquotes DoS）
- SVG/HTML 清洗（验证 `dompurify` XSS 防护）

**理由**：现有测试已覆盖 Markdown 基础功能，恶意输入回归测试确保升级不引入安全回退。

## Risks / Trade-offs

- **[兼容性]** `markdown-it` 升级可能改变部分 Markdown 渲染行为 → 升级前后对比渲染输出，验证现有测试全部通过
- **[overrides 维护负担]** 若上游长期未发布兼容版本，`overrides` 需手动维护 → 添加注释说明移除条件，CI 定期检查
- **[TIPTAP 升级连锁反应]** `@tiptap/*` 升级可能引入 breaking changes → 先尝试 patch/minor 升级，如需 major 升级则评估影响
