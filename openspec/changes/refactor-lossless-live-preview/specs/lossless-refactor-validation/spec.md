## ADDED Requirements

### Requirement: 每阶段必须生成可追溯 AI 验证记录

Issue #254 的每个阶段 SHALL 绑定 child Issue/change、branch、commit、feature flags 和唯一 validation run。实现 AI MUST 将环境、命令、退出码、fixture hashes、byte diff、日志索引和 Go/No-Go 建议写入项目内的 `validation/` 资产目录。聊天消息、未保存的终端输出或只写“tests passed”不得作为阶段证据。`/Users/xian/markflow-test` SHALL 只保存平铺的、供人工使用 MarkFlow 打开的 `.md` 测试文档，不得包含子目录或其他资产。

#### Scenario: AI 完成一次 P1B 候选验证
- **WHEN** 实现 AI 对一个 P1B commit 运行自动化和 desktop workflow
- **THEN** 系统存在唯一 run-id 对应的 `RUN.md`、原始命令输出、fixture hash/diff 和脱敏日志
- **THEN** 阶段文档记录 commit、flags、通过项、失败项和未运行项

#### Scenario: 测试重跑后通过
- **WHEN** 同一候选的首次运行失败而重跑通过
- **THEN** 首次失败证据仍被保留并关联 validation issue
- **THEN** 新运行使用不同 run-id，不能用最后一次成功覆盖失败历史

#### Scenario: 环境清单后来发生变化
- **WHEN** 一个历史 run 完成后，Node、Rust、WebView、OS 或输入法环境发生变化
- **THEN** 历史 run 仍包含同目录不可变 `ENVIRONMENT.md` 与 SHA-256
- **THEN** 更新全局环境模板不会改变历史 run 的环境证据

#### Scenario: 人工测试目录出现非 Markdown 资产
- **WHEN** `/Users/xian/markflow-test` 出现子目录、日志、图片、报告或非 `.md` 文件
- **THEN** 验证前置检查失败
- **THEN** 项目规范、任务和证据仍只保存在仓库内的对应 change/CI artifact

### Requirement: AI、独立 Reviewer 与人工验收相互独立

数据一致性和核心编辑阶段 MUST 在实现 AI gate 后由独立 Reviewer 复核。需要真实视觉、selection、IME、键盘、错误提示或编辑手感判断的阶段 MUST 由人在同一 commit 和 flags 上执行人工脚本。实现 AI MUST NOT 代替人工签署产品体验验收。

#### Scenario: P2 自动化全部通过
- **WHEN** P2 unit、adapter 和 desktop semantic E2E 全部通过
- **THEN** 阶段仍保持未完成，直到独立 Reviewer 和人工 Live Preview/IME 脚本完成

#### Scenario: 人工发现光标跳动
- **WHEN** 自动化通过但人工在 marker reveal 时发现可复现光标跳动
- **THEN** 阶段被标记为 Reject/No-Go 并创建 validation issue
- **THEN** 自动化通过不能覆盖该失败

### Requirement: Go/No-Go 禁止豁免数据完整性

每个阶段 SHALL 明确记录 Go/No-Go。Byte fidelity、错误写盘、安全、跨文档污染、blocked pipeline 保存旧 snapshot 和规范 MUST 项 MUST NOT 被豁免。阶段失败时 MUST 保留上一条已验证路径或 feature flag 回滚。

#### Scenario: 未触及尾部空行发生变化
- **WHEN** 任一阶段的正文局部编辑导致未触及尾部空行 bytes 改变
- **THEN** 阶段立即 No-Go
- **THEN** 人工主观接受或其他测试通过不得改变结论

#### Scenario: 单个高级 widget 验收失败
- **WHEN** P4B 某 widget 在 selection、IME、安全或 source patch 门禁失败
- **THEN** 该 widget 保持 default-off 并回退源码
- **THEN** 失败不要求关闭已通过的基础 Live Preview 或其他独立 widget

### Requirement: 性能与稳定观察门禁必须量化

进入 P4A 和 P5 前，Program SHALL 冻结按文档等级和平台划分的 latency、RSS、样本数、观察时长、操作数量与允许错误率。候选运行开始后 MUST NOT 因测试失败临时放宽门槛。数据完整性、安全、跨文档和保存安全错误允许数量始终为零。

#### Scenario: P5 候选准备 Go
- **WHEN** release candidate 完成三平台稳定观察
- **THEN** 每个平台的观察时长、session 数、操作量、性能分位数、峰值 RSS 和错误率均有机器可读记录
- **THEN** 任一关键错误都使阶段 No-Go，其他平台平均值不能覆盖失败

#### Scenario: 需要修改性能门槛
- **WHEN** 基线测量表明冻结前的门槛需要调整
- **THEN** 调整在候选运行前通过 ADR、独立 Reviewer 和 Program Owner 批准
- **THEN** 已开始的失败 run 仍按原门槛保留，不能重写为通过

### Requirement: 临时证据必须脱敏并可迁移

验证目录 MUST 只使用合成 fixtures 或隔离 workspace，并对日志、截图和报告脱敏。Token、Authorization、私人正文和不必要的完整私人路径 MUST NOT 写入证据。阶段完成时，需要长期保留的证据 SHALL 迁入 child change 或 CI artifact，并保留 manifest/hash。

#### Scenario: Desktop E2E 失败
- **WHEN** E2E 保存 backend/frontend logs 和截图
- **THEN** artifact 在写入验证目录前移除 token、secret 和测试根目录外的私人内容
- **THEN** run record 指向脱敏 artifact 与 manifest
