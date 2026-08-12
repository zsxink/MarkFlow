# P5：发布稳定性与 Legacy 清理

## 1. 目标

在三平台和稳定观察证明新路径可承担产品默认编辑后，删除 ProseMirror/Tiptap、serializer、双正文状态和失效依赖。删除后回滚单位为应用版本。

## 2. 输入与依赖

- P3 已默认稳定；计划默认的 P4 项均分别 Go；
- 无未解决数据完整性、安全和跨文档问题；
- `design/00-program-governance.md`；
- [P5 验证记录](../../validation/phases/P5.md)。

## 3. 实施范围

- macOS/Windows/Linux release candidate 验证；
- Normal/Large/Huge、IME、themes、widgets、export、autosave、conflict 稳定观察；
- 按 NFR 合同在三平台各完成 ≥8 小时/≥2 session，自动化完成 10k transactions、1k save/reconcile、1k mode switches 与 100 failure injections；
- 审计所有 PM/Tiptap/getMarkdown/setMarkdown/trailingNewlines/normalize 消费者；
- 删除 legacy editor、隐藏 DOM、serializer 保存 facade、CSS、dependencies、tests；
- 保留只读 renderer 时明确隔离；
- 更新 docs、issue、migration notes、feature flags；
- sync specs、archive child/program changes。

## 4. AI Coding 验证

AI 必须：

- 搜索并分类所有 legacy symbol/import/CSS/dependency；
- 删除后运行 `npm install`/lockfile 检查、`npm test`、typecheck、build、bundle size；
- 运行 Rust fmt/clippy/test；
- 运行 smoke/regression E2E；
- 运行 canonical L0/L1 全矩阵；
- 运行三主题 visual、IME、keyboard、a11y、security；
- 运行 Normal/Large/Huge performance；
- 运行 external conflict、autosave、resource、export；
- 检查 product bundle 不含 PM/Tiptap runtime；
- 验证只读 export renderer 不可回写正文；
- 运行 `npx openspec validate --all` 与 `bash scripts/check-archive-synced.sh`；
- 生成 release evidence manifest。

## 5. 独立 Reviewer 验证

按项目强制规则，独立 Reviewer 必须静态走查全部 cleanup diff，并重跑 `npm test`、`npx tsc --noEmit`、关键 Rust 与 E2E。Reviewer 特别检查是否仍有 serializer save、双 owner、隐藏 PM DOM、legacy flag 死路径和 dependency 残留。

## 6. 人工验证

至少在可用的 macOS、Windows、Linux 环境各执行 release checklist；缺少平台不能用单平台模拟替代，应阻止三平台完成声明或明确缩小发布范围。

人工覆盖：安装/升级、打开旧文档、日常编辑、IME、模式切换、图片/table/diagram、autosave、外部冲突、save-as、export、崩溃重启、Large/Huge、主题与 accessibility。稳定观察使用冻结 commit；每个平台累计 ≥8 小时、≥2 session，并达到 NFR 中的操作数量。任何代码变化后重新开始相应观察窗口。

## 7. 必须证据

- 三平台 environment 和签字；
- full gate 原始输出；
- dependency/bundle audit；
- legacy symbol zero/approved-readonly report；
- stability observation；
- upgrade/rollback test；
- Reviewer report；
- specs sync/archive gate。

## 8. Go/No-Go

Go：新路径在声明平台通过；量化性能 SLO 与稳定观察样本全部达标，关键错误数为零；legacy 产品真相清零；独立 Reviewer和人工批准；archive gates 通过。

No-Go：任何 serializer/双 owner 残留；关键平台未验；稳定期数据问题；删除后 bundle/test/体验回归；只能靠重新引入 PM 才能正常打开文档。

## 9. 回滚

P5 合入后不运行时热切 owner。出现严重问题时回滚到上一已签名应用版本，并保护用户文件；对新版本产生的文档先验证 bytes 兼容。发布 notes 必须写明回滚版本和恢复步骤。
