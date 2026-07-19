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
- **THEN** 系统使用`convertFileSrc()`生成资产协议URL
- **THEN** 浏览器直接从磁盘加载图片
- **THEN** 图像数据没有发生Base64编码或IPC传输

#### Scenario: 本地镜像复制到存储
- **WHEN** 用户粘贴本地图像文件，设置需要复制到工作区存储
- **THEN** Rust 通过 `fs::copy` 将文件从源路径复制到目标路径
- **THEN** 没有创建Base64中间表示
- **THEN** 目标路径转换为资产协议URL

#### Scenario: 资产协议不可用时Base64回退
- **WHEN** `storageMode` 设置为 `none`
- **THEN** 图像被读取为Base64数据URL
- **THEN** 文档中直接使用数据URL

### Requirement: 带有临时文件的网络图像流
系统 MUST 将网络图像下载流式传输到临时文件，并在完成后自动重命名。

#### Scenario: 网络下载写入临时文件
- **WHEN** 触发网络图片下载
- **THEN** 下载流被写入与目标目录相同的临时文件中
- **THEN** 临时文件名使用 `.tmp` 扩展名加上随机后缀

#### Scenario: 下载完成自动重命名
- **WHEN** 网络下载成功完成
- **THEN** 根据内容长度标头验证文件大小
- **THEN** MIME类型验证以`image/`开头
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
- **WHEN** 同时请求超过4个图像处理操作
- **THEN** 额外操作正在排队
- **THEN** 操作按之前的操作完成处理
- **THEN** 最多同时执行4个操作

#### Scenario: 对象URL清理
- **WHEN** 文档中的图像被删除或文档被关闭
- **THEN** 通过`URL.revokeObjectURL()`撤销关联对象URL
- **THEN** 释放任何中间ArrayBuffer或Blob引用
- **THEN** 未释放的图片资源没有发生内存泄漏

#### Scenario: 浏览器内存管理
- **WHEN** 图片加载并显示在编辑器中
- **THEN** 在图像元素上设置`loading="lazy"`属性
- **THEN** 浏览器可根据需要卸载离屏图像
