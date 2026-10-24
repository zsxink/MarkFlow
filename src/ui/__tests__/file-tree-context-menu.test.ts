vi.mock('../documents/session', () => ({ closeDocumentTabsMatchingPath: vi.fn(async () => true) }));
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { showContextMenuStatic, getWorkspacePath, invoke, showToast, closeWorkspaceFolder } = vi.hoisted(() => ({ showContextMenuStatic: vi.fn(), getWorkspacePath: vi.fn(), invoke: vi.fn(), showToast: vi.fn(), closeWorkspaceFolder: vi.fn() }));
vi.mock('../context-menu', () => ({ showContextMenuStatic }));
vi.mock('../file-tree/index', () => ({ getWorkspacePath, removeEntryFromTree: vi.fn(), insertEntryIntoTree: vi.fn(), startInlineRename: vi.fn(), startInlineCreate: vi.fn(), setWorkspacePath: vi.fn(), refreshFileTree: vi.fn(), closeWorkspaceFolder }));
vi.mock('../../infra/storage', () => ({ deletePath: vi.fn(), copyFile: vi.fn(), readSingleDir: vi.fn(), addRecentFile: vi.fn() }));
vi.mock('../toast', () => ({ showToast }));
vi.mock('../../infra/error', () => ({ reportUserActionError: vi.fn(), classifyError: (e: { message?: string } | string) => ({ message: typeof e === 'string' ? e : (e.message ?? String(e)) }) }));
vi.mock('../sidebar/index', () => ({ clearActiveDocument: vi.fn(), clearActiveDocumentIfMatches: vi.fn(), confirmDocumentTransition: vi.fn(), openFileInEditor: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(), ask: vi.fn() }));

import { showContextMenu } from '../file-tree-context-menu';

beforeEach(() => { showContextMenuStatic.mockReset(); getWorkspacePath.mockReset(); invoke.mockReset(); showToast.mockReset(); closeWorkspaceFolder.mockReset(); });

function findMenuItem(label: string, callIndex = 0) {
  return showContextMenuStatic.mock.calls[callIndex][0].find((item: { label?: string }) => item.label === label);
}

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
    const withoutWorkspace = showContextMenuStatic.mock.calls[0][0].map((item: { label?: string }) => item.label);
    expect(withoutWorkspace).toEqual(expect.arrayContaining(['打开文件夹', '打开文件']));
    // 关闭工作区 only makes sense while a workspace is open (spec: workspace-close).
    expect(withoutWorkspace).not.toContain('关闭工作区');
    getWorkspacePath.mockReturnValue('/work');
    showContextMenu(0, 0, null, 'empty');
    expect(showContextMenuStatic.mock.calls[1][0].map((item: { label?: string }) => item.label)).toEqual(expect.arrayContaining(['复制工作区路径', '关闭工作区', '在文件资源管理器中显示']));
  });

  it('closes the workspace through the shared close flow', async () => {
    closeWorkspaceFolder.mockResolvedValue(undefined);
    getWorkspacePath.mockReturnValue('/work');
    showContextMenu(0, 0, null, 'empty');

    await findMenuItem('关闭工作区').onClick();

    expect(closeWorkspaceFolder).toHaveBeenCalledOnce();
  });

  it('reveals a path through the backend file-manager command', async () => {
    invoke.mockResolvedValue(undefined);
    getWorkspacePath.mockReturnValue('/work');
    showContextMenu(0, 0, '/work/note.md', 'file');

    await findMenuItem('在文件资源管理器中显示').onClick();

    expect(invoke).toHaveBeenCalledWith('open_in_file_manager', { path: '/work/note.md' });
    expect(showToast).not.toHaveBeenCalled();
  });

  it('falls back to the workspace path when revealing the empty area', async () => {
    invoke.mockResolvedValue(undefined);
    getWorkspacePath.mockReturnValue('/work');
    showContextMenu(0, 0, null, 'empty');

    await findMenuItem('在文件资源管理器中显示').onClick();

    expect(invoke).toHaveBeenCalledWith('open_in_file_manager', { path: '/work' });
  });

  it('shows a failure toast with the classified error when reveal fails', async () => {
    invoke.mockRejectedValue({ code: 'io', message: 'Path does not exist: /gone' });
    getWorkspacePath.mockReturnValue('/work');
    showContextMenu(0, 0, '/gone', 'file');

    await findMenuItem('在文件资源管理器中显示').onClick();

    expect(showToast).toHaveBeenCalledWith('打开失败: Path does not exist: /gone');
  });
});
