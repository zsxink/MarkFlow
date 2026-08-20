# P3 人工验收脚本（Program Owner）

> 前置条件：P3 独立 Reviewer 返回 GO/CONDITIONAL，自动 gate 全绿（npm test 516、
> tsc、Rust core 93/tauri 151、byte-contract、openspec）。
> 本脚本由 Program Owner（或代理）在真实桌面应用上执行，需至少 30 分钟连续编辑观察。
> 逐项勾选「验收结论」，并把任何问题记录为阻塞/非阻塞。

环境：
- 应用：`npm run tauri dev`（或已构建的 debug 应用）
- 工作目录：任意真实 Markdown 文档（建议 `/Users/xian/markflow-test` 下新建）
- autosave：产品默认开（`autosave=true` / `autosaveInterval=10000`）
- flags：默认开启 `losslessCoreSession` + `codemirrorLivePreview`
  （如需回滚对照：`localStorage['markflow.losslessCoreSession']='0'` 关 lossless）

## 1. 新建文档并输入中文（含构造）

- [ ] 新建 `.md` 文件，输入中文标题、段落、列表、引用、代码
- [ ] 标题/段落/列表/引用/代码在 Live Preview 下有可辨认的语义样式
- [ ] 光标「进入」marker（如 `**加粗**`）时可正常编辑，不跳光标

## 2. 工具栏与快捷键

- [ ] 用工具栏加粗/斜体/删除线/行内代码/链接/列表/引用/代码块
- [ ] Cmd+B / Cmd+I / Cmd+Shift+S（删除线）作用于当前 selection
- [ ] 每个命令一次 Undo 撤销一步（Cmd+Z），Redo（Cmd+Shift+Z）恢复
- [ ] Source 与 Live Preview 切换后 Undo/Redo 连续可用（同一 History）

## 3. Enter/Backspace（空/非空/嵌套列表等）

- [ ] 普通段落 Enter → 新段落
- [ ] 非空列表项 Enter → 新同级项（继承 marker）；再次 Enter 空项退出列表
- [ ] 嵌套列表 Enter 保持缩进级别；空项退级
- [ ] 引用 Enter 延续 `> `；空引用退出
- [ ] 代码围栏内 Enter/Backspace 是普通文本编辑（不破坏围栏）

## 4. 粘贴

- [ ] 粘贴网页 HTML → 纯文本（无嵌套标签泄漏）
- [ ] 粘贴纯文本 → 原样文本
- [ ] 粘贴图片文件 → 插入 `![](路径)`，可保存路径正确
- [ ] 每次粘贴 = 一次 Undo 撤销（粘贴后紧跟输入，Undo 先撤输入、再撤粘贴）

## 5. 图片修改/删除与 Undo/Redo

- [ ] 双击图片 → 编辑面板；修改路径后确认 → 仅路径变化，周围字节不变
- [ ] 删除图片 → 只删除图片 literal，前后空行保留
- [ ] 上述操作各一次 Undo 可撤销

## 6. Source/Live Preview 切换继续 Undo/Redo

- [ ] 在 Live Preview 编辑后切 Source，Cmd+Z 仍按同一 History 撤销

## 7. autosave + 外部冲突

- [ ] 开启 autosave，编辑后等待两个 tick（约 20s）→ 自动保存
- [ ] 编辑未保存内容时用外部编辑器修改同文件 → 提示外部修改冲突，不静默覆盖

## 8. Save As / 关闭重开 / 导出

- [ ] Save As → 新文件保存成功，原文件不动
- [ ] 关闭当前文档 → 无未保存内容时无提示
- [ ] 导出 PDF/HTML → 输出与当前内容一致

## 9. A/B 双文档

- [ ] 同时打开 A、B 两个文档；在 A 编辑不影响 B 的 dirty/保存

## 10. 连续编辑观察（至少 30 分钟）

- [ ] 连续输入中英混排、emoji，未发现 selection 跳变、dirty 异常、保存错误、输入丢失
- [ ] 记录任何 selection/ dirty/保存/资源问题（截图或描述）

## 11. 默认 flags 零编辑 lifecycle（全新 fixture）

- [ ] 用全新 LF/CRLF/Mixed/BOM fixtures 打开文档，零编辑等待两个 autosave tick、
      干净 Ctrl+S、关闭，确认无写盘、无关闭提示、mtime/hash/length 不变

## 12. 与 legacy 的体验差异（对比）

- [ ] 记录任何相比旧 WYSIWYG 的阻塞性体验差异

## 验收结论

- [ ] 全部项 PASS 或明确接受的 FALLBACK-ACCEPTED
- [ ] 最小 parity 矩阵（`validation/minimum-parity-matrix.md`）逐行签署
- [ ] 结论：**ACCEPTED / REJECTED**（如 REJECTED 列出阻塞项）

验收人：____________  日期：____________