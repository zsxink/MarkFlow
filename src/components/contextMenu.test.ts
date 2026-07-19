import { beforeEach, describe, expect, it, vi } from 'vitest';

const { showContextMenuStatic, getWorkspacePath } = vi.hoisted(() => ({ showContextMenuStatic: vi.fn(), getWorkspacePath: vi.fn() }));
vi.mock('./ui/contextMenu', () => ({ showContextMenuStatic }));
vi.mock('./fileTree', () => ({ getWorkspacePath, removeEntryFromTree: vi.fn(), insertEntryIntoTree: vi.fn(), startInlineRename: vi.fn(), startInlineCreate: vi.fn(), setWorkspacePath: vi.fn(), refreshFileTree: vi.fn() }));
vi.mock('../lib/storage', () => ({ deletePath: vi.fn(), copyFile: vi.fn(), readSingleDir: vi.fn(), addRecentFile: vi.fn() }));
vi.mock('./toast', () => ({ showToast: vi.fn() }));
vi.mock('../lib/error', () => ({ reportUserActionError: vi.fn() }));
vi.mock('./sidebar', () => ({ clearActiveDocument: vi.fn(), clearActiveDocumentIfMatches: vi.fn(), confirmDocumentTransition: vi.fn(), openFileInEditor: vi.fn() }));
vi.mock('@tauri-apps/plugin-shell', () => ({ open: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(), ask: vi.fn() }));

import { showContextMenu } from './contextMenu';

beforeEach(() => { showContextMenuStatic.mockReset(); getWorkspacePath.mockReset(); });

describe('file context menu', () => {
  it('offers file actions and a reveal action for a file', () => {
    getWorkspacePath.mockReturnValue('/work');
    showContextMenu(10, 20, '/work/note.md', 'file');
    const [items, position] = showContextMenuStatic.mock.calls[0];
    expect(items.map((item: { label?: string }) => item.label)).toEqual(expect.arrayContaining(['新建文件', '重命名', '复制(副本)', '删除', '复制文件路径', '复制绝对路径', '在文件资源管理器中显示']));
    expect(position).toEqual({ x: 10, y: 20 });
  });

  it('offers open actions without a workspace and workspace copy with one', () => {
    getWorkspacePath.mockReturnValue(null);
    showContextMenu(0, 0, null, 'empty');
    expect(showContextMenuStatic.mock.calls[0][0].map((item: { label?: string }) => item.label)).toEqual(expect.arrayContaining(['打开文件夹', '打开文件']));
    getWorkspacePath.mockReturnValue('/work');
    showContextMenu(0, 0, null, 'empty');
    expect(showContextMenuStatic.mock.calls[1][0].map((item: { label?: string }) => item.label)).toEqual(expect.arrayContaining(['复制工作区路径', '在文件资源管理器中显示']));
  });
});
