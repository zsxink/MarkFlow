# image-streaming Specification

## Purpose
定义本地与网络图片的流式传输、临时文件处理、IPC 限制和并发控制。

## Agent Context
- **源码入口：** `src/lib/imageUtils.ts`、`src/lib/storage.ts`、`src-tauri/src/commands/files.rs`。
- **关联规范：** `safe-http-fetch`、`image-naming`、`rendered-document-export`。
- **不变量：** 本地文件优先经 asset 协议访问；网络下载必须先写同目录临时文件再原子改名；并发限制不得绕过大小或类型校验。
- **验证：** `npm test -- src/lib/imageUtils.test.ts`；`cargo test --manifest-path src-tauri/Cargo.toml`；`npx openspec validate image-streaming --strict`。

## Requirements

### Requirement: 通过资产协议进行本地图像流传输
The system SHALL prefer streaming local image files through the Tauri `asset://` protocol instead of Base64 encoding and IPC transfer.

#### Scenario: 通过资产URL显示本地图像
- **WHEN** 文档中引用了本地图片文件
- **THEN** 系统使用 `convertFileSrc()` 生成资产协议 URL
- **THEN** 浏览器直接从磁盘加载图片
- **THEN** 图像数据没有发生 Base64 编码或 IPC 传输

#### Scenario: 本地图片复制到存储
- **WHEN** 用户粘贴/拖入本地图像文件
- **AND** `imageApplyToLocal` 设置为 `true`
- **THEN** 调用专用 `copy_image_to_storage` Rust 命令复制文件
- **THEN** 目标路径转换为资产协议 URL
- **AND** 不使用通用 `copy_file` IPC 命令

#### Scenario: 本地图片引用原始路径
- **WHEN** 用户粘贴/拖入本地图像文件
- **AND** `imageApplyToLocal` 设置为 `false`
- **THEN** 图像路径不被复制到存储位置
- **THEN** 直接在 Markdown 中引用原文件路径
- **THEN** 资产协议 URL 用于渲染

#### Scenario: 剪贴板图片始终保存
- **WHEN** 用户从剪贴板粘贴图片（非本地文件）
- **THEN** 图片始终保存到存储位置
- **AND** `imageApplyToLocal` 与 `imageApplyToNetwork` 设置不影响剪贴板图片

### Requirement: 带有临时文件的网络图像流
系统 MUST 将网络图像下载流式传输到临时文件，并在完成后自动重命名。

#### Scenario: 网络下载写入临时文件
- **WHEN** `imageApplyToNetwork` 为 `true` 且触发网络图片下载
- **THEN** 下载流被写入与目标目录相同的临时文件中
- **THEN** 临时文件名使用 `.tmp` 扩展名加上随机后缀

#### Scenario: 下载完成自动重命名
- **WHEN** 网络下载成功完成
- **THEN** 根据 Content-Length 标头验证文件大小
- **THEN** MIME 类型验证以 `image/` 开头
- **THEN** 临时文件自动重命名为目标文件名
- **THEN** 如果验证失败，临时文件被删除并返回错误

#### Scenario: 下载失败清理临时文件
- **WHEN** 网络下载中途失败
- **THEN** 部分临时文件被删除
- **THEN** 返回错误并给出失败原因
- **THEN** 磁盘上没有保留部分文件

### Requirement: 图像数据的二进制IPC
当需要进行图像数据的IPC传输时，系统 MUST 使用二进制传输并在编码前检查源大小。

#### Scenario: IPC传输前尺寸检查
- **WHEN** 命令收到通过IPC传输图像数据的请求
- **THEN** 读入内存前检查源文件大小
- **THEN** 如果文件超过20MB，不读取立即返回错误
- **THEN** 如果文件在限制范围内，则数据被传输

#### Scenario: Base64 强制执行图像大小限制
- **WHEN** 大于20MB的文件调用`read_file_as_base64`
- **THEN** an error is returned: "文件过大，最大支持 20MB"
- **THEN** 没有数据被读取或编码

### Requirement: 并发限制
系统 MUST 限制并发图像处理操作和飞行中的总字节数。

#### Scenario: 最大并发操作数
- **WHEN** 同时请求超过 4 个图像处理操作
- **THEN** 额外操作正在排队
- **THEN** 操作按之前的操作完成处理
- **THEN** 最多同时执行 4 个操作

#### Scenario: 对象URL清理
- **WHEN** 文档中的图像被删除或文档被关闭
- **THEN** 通过 `URL.revokeObjectURL()` 撤销关联对象 URL
- **THEN** 释放任何中间 ArrayBuffer 或 Blob 引用
- **THEN** 未释放的图片资源没有发生内存泄漏

#### Scenario: 浏览器内存管理
- **WHEN** 图片加载并显示在编辑器中
- **THEN** 在图像元素上设置 `loading="lazy"` 属性
- **THEN** 浏览器可根据需要卸载离屏图像

### Requirement: 专用后端命令的安全约束

系统 SHALL 为图片文件操作提供专用的 Rust 命令，这些命令只允许在授权存储目录内操作，并通过路径规范化防止逃逸。

#### Scenario: 路径逃逸检测
- **WHEN** 图片命令接收到一个路径
- **THEN** 路径经过 `fs::canonicalize` 归一化
- **AND** 与后端根据当前三种存储规则计算出的目标根目录，或后端生成的当前草稿暂存根目录比较
- **AND** 如果目标不在授权目录内，返回安全错误

#### Scenario: 符号链接逃逸检测
- **WHEN** 图片命令的目标路径或其祖先路径中存在指向授权目录外的符号链接
- **THEN** 操作被拒绝
- **AND** 返回错误：「不允许的路径：符号链接指向存储目录外」

### Requirement: 未保存文档暂存图片流

系统 SHALL 通过资产协议显示后端暂存目录中的图片，并在首次保存迁移后切换到最终文件引用。

#### Scenario: 暂存图片显示
- **WHEN** 未保存文档中的图片写入 `pending-images/<draft-id>/`
- **THEN** 编辑器使用受控资产 URL 显示该文件
- **AND** Markdown 内部保留可识别、可迁移的暂存引用

#### Scenario: 首次保存后释放暂存资源
- **WHEN** 暂存图片已经迁移且 Markdown 文件写入成功
- **THEN** 对应对象 URL 或资产映射被释放
- **AND** 暂存目录被删除
