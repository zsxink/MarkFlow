# 验证执行协议

## 1. 开始前

AI 必须确认：

- `git rev-parse --show-toplevel` 返回当前目标仓库，并把实际绝对路径写入本次 run；
- 当前 branch 为 Program Owner 批准的 Issue #254 工作分支，并记录本阶段 start commit；
- `git status` 中所有既有变更归属清楚；
- 前置阶段已 Go；
- 对应 OpenSpec strict validation 通过；
- 自动化测试只使用项目 canonical fixtures 或隔离生成 workspace；人工测试可从 `/Users/xian/markflow-test` 复制对应 Markdown 文档，但验证流程不得改写原人工样本；
- `/Users/xian/markflow-test` 的直接条目全部是 `.md` 文件且没有子目录，选择方式与特殊字节预期见 `MANUAL-FIXTURES.md`；
- 不会覆盖用户真实文档。

P0 corrective run 允许前置产品行为为预期失败，但必须使用隔离副本；P0S 及 P1B 之后的零编辑 lifecycle 必须是绿色回归。所有涉及 autosave 的 L0 run 必须记录实际开关和 interval，并至少等待两个 tick；`autosave=false` 的 smoke 只能计为基础 UI smoke。

## 2. Run record

每次运行从 `templates/RUN-RECORD.md` 复制完整记录，保存到 `evidence/<phase>/<run-id>/RUN.md`。在执行第一条 gate 前，将完整环境实测值写入同目录不可变的 `ENVIRONMENT.md`，计算 SHA-256 并填入 RUN；不能只链接会变化的全局环境文件。命令输出分别保存，不把多个命令混成无法判断退出码的日志。

## 3. 通用自动化 Gate

按阶段适用性运行并记录：

```bash
npm test
npx tsc --noEmit
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
npm run test:e2e
npm run test:e2e:regression
npx openspec validate refactor-lossless-live-preview --strict
npx openspec validate --all
bash scripts/check-archive-synced.sh
```

Core child workspace 出现后增加该 workspace 的 `cargo fmt --check`、`cargo clippy -D warnings`、`cargo test` 和 property/fuzz 命令，并在阶段文档记录确切 manifest。

## 4. Byte 证据

每次文件工作流记录：

- fixture ID；
- input path 的工作区内相对路径；
- input length/SHA-256；
- edit intent 和 source range；
- output length/SHA-256；
- L0 byte diff；
- L1 surviving interval result；
- mtime/file identity；
- 保存次数与触发来源。
- dirty transition、关闭提示、autosave 开关/interval 与等待 tick 数；

不得只记录 Markdown 可见文本相同。

零编辑 lifecycle 证据必须驱动真实 open、editor hydration/read-only 同步、dirty scheduler、autosave coordinator 和隔离文件 write。Standalone editor、fixture/oracle 自比较或 mock 掉 write 的测试不能满足 E3。

## 5. Desktop 证据

E2E 和人工使用隔离 data/workspace。证据至少包含：应用 commit、flags、窗口/主题、fixture hash、操作步骤、结果、backend/frontend logs、失败截图。IME/selection/marker 问题优先录屏。

## 6. 失败处理

1. 保留第一次失败全部产物；
2. 创建 issue 文件；
3. 标注 severity：Data Loss、Security、Cross-document、Save Safety、Functional、Visual、Performance、Flaky；
4. 记录最小复现、expected/actual、commit/flags/environment；
5. 修复后创建新 run-id；
6. 在旧 issue 中链接验证 run；
7. 只有验证通过才能关闭 issue。

历史 RUN/ENVIRONMENT/REVIEW 是不可变证据。人工发现历史 AI run 未覆盖的新路径时，建立 corrective run 并链接历史记录，不得直接修改历史 run 的结论使其看起来已经覆盖。

## 7. Reviewer

Reviewer 不使用实现 AI 已启动的未封存进程。Reviewer 从干净环境读取同一 commit，静态检查 diff，选择关键命令重跑，并把报告写入对应 run 的 `REVIEW.md`。数据一致性阶段必须重跑 byte tests 和真实 save conflict。

## 8. 人工验收

AI 把候选 commit、flags、fixture 和操作步骤准备好，但不能代替人工点击和主观判断。人工把结果直接写入阶段文档的“人工验证记录”。若人工发现失败，阶段立即 FAIL/REJECTED，并创建 issue。

## 9. 封存

阶段 Go 后：

- 阶段文档填入最终 run-id；
- evidence manifest 计算 hash；
- 所有 open issues 分类；
- Reviewer 和人工签字存在；
- Program Owner 写 Go；
- 临时大文件可清理，但报告、hash、关键日志与截图索引保留；
- 需要长期保存的证据保留在 umbrella change 或迁入 CI artifact，不能只留在用户主目录。
