# Tasks

## 1. 节点右键「关闭文件夹」入口

- [x] 1.1 `src/ui/file-tree-context-menu.ts` 节点分支（file/folder）加带 divider 的「关闭文件夹」项，可见条件为已有工作区，action 复用 `'close-workspace'` case。验证：`npx tsc --noEmit`

## 2. 文案统一

- [x] 2.1 按 design 表替换 8 处前端文案 + 1 处 Rust label（`menu/mod.rs:234`）。验证：`grep -rn "工作区" src/ src-tauri/src/` 剩余命中均为非用户可见
- [x] 2.2 同步更新测试断言：`file-tree-context-menu.test.ts`（含新增节点右键用例：有工作区时 file/folder 菜单含「关闭文件夹」且点击调 closeWorkspaceFolder；无工作区时不含）、`menu/tests.rs:319`、及其它 grep 到的文案断言。验证：`npm test -- src/ui/__tests__/file-tree-context-menu.test.ts`

## 3. 回归与门禁

- [x] 3.1 全量 `npm test`、`npx tsc --noEmit`、`node scripts/check-layering.mjs`、`cargo test --manifest-path src-tauri/Cargo.toml` 通过。验证：四条命令退出码 0
