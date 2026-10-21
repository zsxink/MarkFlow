# Tasks

## 1. 移除零校验写盘命令

- [x] 1.1 删除 `src-tauri/src/commands/export.rs` 中的 `write_file_binary` 函数及其 `#[tauri::command]` 属性与文档注释；验证方式：`grep -n "write_file_binary" src-tauri/src/commands/export.rs` 无输出
- [x] 1.2 从 `src-tauri/src/lib.rs` 的 `generate_handler!` 中移除 `commands::export::write_file_binary` 注册；验证方式：`grep -n "write_file_binary" src-tauri/src/lib.rs` 无输出
- [x] 1.3 全仓库确认无残留引用（含 `src/`、`src-tauri/`、测试与文档配置）；验证方式：`grep -rn "write_file_binary" --include="*.rs" --include="*.ts" --include="*.json" --include="*.toml" .` 无输出

## 2. 规范与文档

- [x] 2.1 确认 delta spec `openspec/changes/remove-write-file-binary/specs/export-workspace-bypass/spec.md` 已声明「导出写盘命令必须经过授权」要求；验证方式：`openspec validate remove-write-file-binary --strict` 通过
- [x] 2.2 检查 `docs/cleanup-plan/` 中相关条目无需修改（历史文档保留原样），并在 PR 说明中注明该项已完成；验证方式：本次变更不触碰 `docs/cleanup-plan/` 文件

## 3. 回归验证

- [x] 3.1 Rust 侧质量门：`cargo fmt --manifest-path src-tauri/Cargo.toml --check`、`cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`、`cargo test --manifest-path src-tauri/Cargo.toml` 全部通过
- [x] 3.2 前端质量门：`npx tsc --noEmit`、`npm run build`、`npm test` 全部通过
- [x] 3.3 导出回归：确认 DOCX 走 `save_binary_export`、PDF 走 `create_pdf`、图片导出命令均未被改动；验证方式：`git diff origin/main -- src-tauri/src/commands/export.rs` 仅包含 `write_file_binary` 的删除
