## 1. Rust 后端：移除 write_file 工作区检查

- [ ] 1.1 在 `src-tauri/src/commands/files.rs` 的 `write_file` 函数中移除 `validate_path_in_workspace` 调用，仅保留 `resolve_path` 和 `atomic_write`
- [ ] 1.2 为 `write_file` 添加单元测试：设置工作区后，保存已明确指定的工作区外现有文件应成功
- [ ] 1.3 为 `write_file` 添加单元测试：工作区内文档仍通过原子写入保存
- [ ] 1.4 验证 `create_file`、`rename_path`、`delete_path`、`copy_file` 的工作区边界和符号链接校验未受影响

## 2. 前端：自动保存 dirty guard

- [ ] 2.1 修改 `src/main.ts` 的 `startAutoSave`，在 tick 回调最前面增加 `isDocumentDirty()` 检查，干净文档直接返回
- [ ] 2.2 将 `saveActiveDocument` 返回值从布尔改为 `'saved' | 'skipped' | 'failed'` 联合类型，更新所有调用点
- [ ] 2.3 在 `startAutoSave` 中仅在返回值为 `'failed'` 时增加 `autosaveErrorCount`，`'skipped'` 和 `'saved'` 不增加

## 3. 测试

- [ ] 3.1 添加前端单元测试：自动保存 tick 在 `dirty=false` 时不调用 `saveActiveDocument`
- [ ] 3.2 添加前端单元测试：自动保存 tick 在 `dirty=true` 时调用一次保存
- [ ] 3.3 添加前端单元测试：保存成功清零 `autosaveErrorCount`
- [ ] 3.4 添加前端单元测试：实际写入失败增加 `autosaveErrorCount`
- [ ] 3.5 添加前端单元测试：保存进行中跳过不增加 `autosaveErrorCount`
- [ ] 3.6 运行 `npm test` 确认所有测试通过
- [ ] 3.7 运行 `npx tsc --noEmit` 确认类型检查通过
- [ ] 3.8 运行 `cargo test` 确认 Rust 测试通过
