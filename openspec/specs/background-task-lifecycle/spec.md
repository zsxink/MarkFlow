# background-task-lifecycle Specification

## Purpose
定义文件监听及其他后台任务统一、显式且可取消的生命周期，避免线程泄漏或退出阻塞。

## Agent Context
- **源码入口：** `src-tauri/src/fs/watcher.rs`、`src-tauri/src/state.rs`、`src-tauri/src/lib.rs`。
- **关联规范：** `file-tree-architecture`、`error-handling`、`crash-logging`。
- **不变量：** 切换工作区和退出前必须停止旧 watcher；队列溢出只能安排一次受控重扫；后台任务不得阻塞应用退出。
- **验证：** `cargo test --manifest-path src-tauri/Cargo.toml`；`npx openspec validate background-task-lifecycle --strict`。

## Requirements

### Requirement: Watcher 明确可停止
文件观察器 MUST 公开显式停止，指示工作线程退出并加入它，释放底层通知句柄。

#### Scenario: 工作区开关停止前一个观察者
- **WHEN** 观察者处于活动状态时设置新工作区
- **THEN** 在新的观察者启动之前，前一个观察者被停止（线程加入），没有泄漏线程

#### Scenario: App退出停止watcher
- **WHEN** 申请收到退出请求
- **THEN** 在进程终止之前所有活跃的观察者都被停止

### Requirement: 具有溢出处理的有界观察者队列
The watcher worker SHALL use a bounded event queue; on overflow it SHALL record a `warn` log with drop count and schedule exactly one controlled rescan.

#### Scenario: 队列溢出触发重新扫描
- **WHEN** 有界队列已满，文件事件无法入队
- **THEN** 对丢弃进行计数和记录，一旦负载消退，就会触发单个受控目录重新扫描

#### Scenario: 观察者线程错误被记录而不是沉默
- **WHEN** 底层通知后端在worker内部返回运行时错误
- **THEN** 错误会与上下文一起记录，并且工作线程保持活动状态或重新启动，而不是默默结束

### Requirement: 定时器和网络任务可取消
后端计时器和正在进行的网络请求 MUST 在工作区切换、窗口关闭和应用程序退出时取消。

#### Scenario: 关闭正在运行的任务
- **WHEN** 应用程序关闭，而网络/文件任务仍在进行中
- **THEN** 任务收到取消信号并继续退出而不挂起它们

#### Scenario: 接收端关闭
- **WHEN** `file-changed` 的前端事件接收器已关闭
- **THEN** 后端发出被视为尽力而为并记录，而不是恐慌
