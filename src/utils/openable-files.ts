// ── 可打开文件格式分类 ────────────────────────────────────────────────
// 单真相：打开分流（fileops）与文件浏览器支持格式判定共用同一分类。
// Rust 侧副本见 src-tauri/src/commands/files/entry.rs 的
// `is_supported_browser_entry`，两侧测试断言同一清单，新增格式需同步修改。

export const IMAGE_EXTENSIONS = ['svg', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] as const;

export type OpenableFileKind = 'markdown' | 'image' | 'unsupported';

/** 取最后一个 `.` 后的小写后缀判定：`.md` → 文档，图片后缀 → 图片，其余不支持。 */
export function classifyOpenableFile(name: string): OpenableFileKind {
  const dot = name.lastIndexOf('.');
  if (dot < 0 || dot === name.length - 1) return 'unsupported';
  const extension = name.slice(dot + 1).toLowerCase();
  if (extension === 'md') return 'markdown';
  return (IMAGE_EXTENSIONS as readonly string[]).includes(extension) ? 'image' : 'unsupported';
}

/** 文件浏览器（默认隐藏不支持格式时）是否允许列出该文件名。 */
export function isFileBrowserSupported(name: string): boolean {
  return classifyOpenableFile(name) !== 'unsupported';
}
