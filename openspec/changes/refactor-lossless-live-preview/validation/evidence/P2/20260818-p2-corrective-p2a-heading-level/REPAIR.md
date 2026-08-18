# P2-A corrective：heading level class 应用修复

Run ID：`20260818-p2-corrective-p2a-heading-level`
触发：P2 Program Owner 人工验收发现 P2-A（`20260818-p2-program-owner-acceptance`）

## 问题

`projection.ts` 的 `buildDecorations` 对所有 heading construct 调用 `decorationFor(range.cls)`
（inactive 分支）时**未传入 level**，因此 `.mf-h1`–`.mf-h6` CSS 规则不可达，裸 `.mf-h`
无样式。标题视觉语义虽由 CM highlight 层保证（P2-1 通过），但分级放大失效。

根因：`classifyNode` 返回 `{ cls, level }`，construct 记录在 `ConstructRange` 丢弃了 level，
`decorationFor` 的 levelCls 恒空。

## 修复

1. `ConstructRange` 增加 `level?: number`。
2. construct push 时保存 `level: cls.level`。
3. finalBuilder inactive 分支调用 `decorationFor(range.cls, range.level)`。
4. 新增 adapter 测试：heading level class（`mf-h1`/`mf-h2`）被应用。

## 验证

- `npx tsc --noEmit`：PASS
- `npm run test -- src/lib/lossless/projection.test.ts`：6/6 PASS（新增 heading level 测试）
- `npm run test` 全量：420 PASS（35 files），无 regression

## 结论

P2-A 已修复，heading 分级 class 生效。新增测试锁定回归。

说明：本 corrective 不改变 P2 判定（GO 条件性维持），仅关闭人工验收发现的产品问题。