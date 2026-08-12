# Fixtures 目录

状态：NOT STARTED

本目录只保存人工/E2E 可安全复制使用的测试文件。正式 canonical fixtures 应进入当前 program 的版本控制测试目录；这里可以保存运行副本。

每个 fixture 必须在 manifest 中记录：ID、用途、encoding、BOM、EOL、尾部 line breaks、size、SHA-256、是否包含敏感数据。禁止从用户真实笔记直接复制。

P0 需要建立的类别：UTF-8/BOM、LF/CRLF/CR/Mixed、尾部 0/1/2/3 换行、CJK/emoji/ZWJ、list/fence/frontmatter/table/reference/footnote、raw HTML、malformed、image spacing、1MB/10MB/50MB。
