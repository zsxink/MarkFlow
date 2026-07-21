## 1. 脚本实现

- [x] 1.1 创建 `scripts/check-archive-synced.sh`：实现 archive delta spec 同步校验逻辑（日期 cutoff、内容行匹配、结果报告）
- [x] 1.2 验证脚本可执行：`bash scripts/check-archive-synced.sh` 在 archive 目录存在时能正确检测同步状态

## 2. CI 集成

- [x] 2.1 在 `.github/workflows/ci.yml` 中添加 `npx openspec validate --all` 步骤
- [x] 2.2 在 `.github/workflows/ci.yml` 中添加 `bash scripts/check-archive-synced.sh` 步骤

## 3. 文档更新

- [x] 3.1 在 `AGENTS.md` 归档流程中补充「归档后验证」步骤：运行 `npx openspec validate --all` 与 `bash scripts/check-archive-synced.sh`
