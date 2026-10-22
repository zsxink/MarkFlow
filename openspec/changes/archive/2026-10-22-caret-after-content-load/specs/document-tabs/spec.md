# Spec Delta

## ADDED Requirements

### Requirement: 整篇内容替换后的光标定位
系统 SHALL 在整篇内容替换后把插入光标重新锚定到与操作语义一致的位置，并使浏览器可见光标与文档选择一致。文档加载（打开文件、恢复标签、切回所见即所得后的重新接纳）SHALL 把光标置于首个可编辑位置；就地重渲染（frontmatter 补丁、保存后图片路径改写）SHALL 保留用户原编辑位置附近。上述选区调整 SHALL NOT 进入撤销历史，且 SHALL NOT 额外触发一次文档更新通知。

#### Scenario: 打开文件后光标落在首个可编辑位置
- **WHEN** 用户在光标位于文档开头（含启动时的空文档）时打开另一个文件
- **THEN** 加载完成后光标 SHALL 位于新文档首个可编辑位置内，而非被映射到文末
- **THEN** 后续输入 SHALL 落在该位置

#### Scenario: 就地重渲染保留编辑位置
- **WHEN** 用户在文档中部编辑时触发 frontmatter 补丁或保存后图片路径改写
- **THEN** 重渲染后光标 SHALL 保留在原编辑位置附近，SHALL NOT 回到文档开头

#### Scenario: 源码切回所见即所得保留位置
- **WHEN** 用户从源码模式切回所见即所得模式
- **THEN** 光标 SHALL 对应切走前的位置附近，SHALL NOT 落在映射后的文末

#### Scenario: 光标调整不污染撤销栈
- **WHEN** 整篇内容替换后的光标重新锚定执行完毕
- **THEN** 撤销历史 SHALL 不包含该选区调整
- **THEN** 文档更新通知 SHALL NOT 因该选区调整而额外触发一次
