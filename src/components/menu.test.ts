import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock storage module before importing menu
vi.mock('../lib/storage', () => ({
  loadSettings: vi.fn(),
  clearRecentHistory: vi.fn(),
  addRecentFile: vi.fn(),
}));

// Mock sidebar for confirmDocumentTransition etc.
vi.mock('./sidebar', () => ({
  confirmDocumentTransition: vi.fn().mockResolvedValue(true),
  openFileInEditor: vi.fn(),
  clearActiveDocument: vi.fn(),
}));

vi.mock('./fileTree', () => ({
  setWorkspacePath: vi.fn(),
  refreshFileTree: vi.fn(),
}));

vi.mock('./toast', () => ({
  showToast: vi.fn(),
}));

const { loadSettings } = await import('../lib/storage');
const { addRecentFile } = await import('../lib/storage');
const { confirmDocumentTransition, openFileInEditor, clearActiveDocument } = await import('./sidebar');
const { setWorkspacePath, refreshFileTree } = await import('./fileTree');
const { showToast } = await import('./toast');

async function setupMenuContainer() {
  document.body.innerHTML = `
    <div id="toolbar-menu-btn">Menu</div>
    <div id="app-menu" class="app-menu" hidden>
      <div id="menu-recent-files"></div>
      <div id="menu-recent-folders"></div>
    </div>
  `;
}

describe('menu DOM injection prevention', () => {
  beforeEach(() => {
    setupMenuContainer();
    vi.clearAllMocks();
  });

  it('renders file names as text content, not HTML', async () => {
    const { renderMenu } = await import('./menu');

    vi.mocked(loadSettings).mockResolvedValue({
      recentFiles: ['<img src=x onerror=alert(1)>'],
      recentFolders: ['<img src=y onerror=alert(2)>'],
    } as never);

    await renderMenu();

    const items = document.querySelectorAll('.app-menu-item');
    expect(items).toHaveLength(2);

    // Both items: textContent is the raw string, innerHTML is HTML-encoded
    expect(items[0].textContent).toBe('<img src=x onerror=alert(1)>');
    expect(items[0].innerHTML).toBe('&lt;img src=x onerror=alert(1)&gt;');
    expect((items[0] as HTMLElement).dataset.path).toBe('<img src=x onerror=alert(1)>');

    expect(items[1].textContent).toBe('<img src=y onerror=alert(2)>');
    expect(items[1].innerHTML).toBe('&lt;img src=y onerror=alert(2)&gt;');
    expect((items[1] as HTMLElement).dataset.path).toBe('<img src=y onerror=alert(2)>');
  });

  it('renders file names with HTML special characters as plain text', async () => {
    const { renderMenu } = await import('./menu');

    vi.mocked(loadSettings).mockResolvedValue({
      recentFiles: ['file_with_<>"\'&.md'],
      recentFolders: [],
    } as never);

    await renderMenu();

    const items = document.querySelectorAll('.app-menu-item');
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toBe('file_with_<>"\'&.md');
    // innerHTML encodes <, >, & but not " or ' in textContent
    expect(items[0].innerHTML).toBe('file_with_&lt;&gt;"\'&amp;.md');
    expect((items[0] as HTMLElement).dataset.path).toBe('file_with_<>"\'&.md');
  });

  it('shows empty state when no recent files', async () => {
    const { renderMenu } = await import('./menu');

    vi.mocked(loadSettings).mockResolvedValue({
      recentFiles: [],
      recentFolders: [],
    } as never);

    await renderMenu();

    const emptyEls = document.querySelectorAll('.app-menu-empty');
    expect(emptyEls).toHaveLength(2);
    expect(emptyEls[0].textContent).toBe('无');
    expect(emptyEls[1].textContent).toBe('无');
  });

  it('renders section titles', async () => {
    const { renderMenu } = await import('./menu');

    vi.mocked(loadSettings).mockResolvedValue({
      recentFiles: [],
      recentFolders: [],
    } as never);

    await renderMenu();

    const titles = document.querySelectorAll('.app-menu-section-title');
    expect(titles).toHaveLength(2);
    expect(titles[0].textContent).toBe('最近打开的文件');
    expect(titles[1].textContent).toBe('最近打开的文件夹');
  });

  it('handles file paths with backslashes and forward slashes', async () => {
    const { renderMenu } = await import('./menu');

    vi.mocked(loadSettings).mockResolvedValue({
      recentFiles: ['C:\\Users\\test\\file.md', '/home/user/file.md'],
      recentFolders: [],
    } as never);

    await renderMenu();

    const items = document.querySelectorAll('.app-menu-item');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toBe('file.md');
    expect((items[0] as HTMLElement).dataset.path).toBe('C:\\Users\\test\\file.md');
    expect(items[1].textContent).toBe('file.md');
    expect((items[1] as HTMLElement).dataset.path).toBe('/home/user/file.md');
  });
});

describe('menu event delegation', () => {

  async function setupWithItems() {
    document.body.innerHTML = `
      <div id="toolbar-menu-btn">Menu</div>
      <div id="app-menu" class="app-menu">
        <div id="menu-recent-files">
          <button class="app-menu-item" data-path="/path/to/file.md" data-type="file">file.md</button>
        </div>
        <div id="menu-recent-folders">
          <button class="app-menu-item" data-path="/path/to/folder" data-type="folder">folder</button>
        </div>
      </div>
    `;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens a file when a file menu item is clicked', async () => {
    vi.mocked(confirmDocumentTransition).mockResolvedValue(true);
    setupWithItems();
    const { initMenu } = await import('./menu');
    initMenu();

    const fileBtn = document.querySelector('#menu-recent-files .app-menu-item')!;
    fileBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // Allow microtask queue to flush (handlers are async)
    await vi.waitFor(() => {
      expect(addRecentFile).toHaveBeenCalledWith('/path/to/file.md');
      expect(openFileInEditor).toHaveBeenCalledWith('/path/to/file.md');
    });
  });

  it('opens a folder when a folder menu item is clicked', async () => {
    vi.mocked(confirmDocumentTransition).mockResolvedValue(true);
    setupWithItems();
    const { initMenu } = await import('./menu');
    initMenu();

    const folderBtn = document.querySelector('#menu-recent-folders .app-menu-item')!;
    folderBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await vi.waitFor(() => {
      expect(setWorkspacePath).toHaveBeenCalledWith('/path/to/folder');
      expect(clearActiveDocument).toHaveBeenCalled();
      expect(refreshFileTree).toHaveBeenCalled();
      expect(showToast).toHaveBeenCalledWith('文件夹已打开');
    });
  });

  it('does nothing when clicking outside an item', async () => {
    setupWithItems();
    const { initMenu } = await import('./menu');
    initMenu();

    const filesContainer = document.getElementById('menu-recent-files')!;
    filesContainer.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // Allow microtasks to settle, then assert no calls were made
    await vi.waitFor(() => {
      expect(addRecentFile).not.toHaveBeenCalled();
      expect(setWorkspacePath).not.toHaveBeenCalled();
    });
  });

  it('does nothing when clicking an item with no dataset.path', async () => {
    document.body.innerHTML = `
      <div id="toolbar-menu-btn">Menu</div>
      <div id="app-menu" class="app-menu">
        <div id="menu-recent-files">
          <button class="app-menu-item">no-path</button>
        </div>
        <div id="menu-recent-folders"></div>
      </div>
    `;
    const { initMenu } = await import('./menu');
    initMenu();

    const btn = document.querySelector('.app-menu-item')!;
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await vi.waitFor(() => {
      expect(addRecentFile).not.toHaveBeenCalled();
    });
  });

  it('respects confirmDocumentTransition returning false', async () => {
    vi.mocked(confirmDocumentTransition).mockResolvedValue(false);
    setupWithItems();
    const { initMenu } = await import('./menu');
    initMenu();

    const fileBtn = document.querySelector('#menu-recent-files .app-menu-item')!;
    fileBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await vi.waitFor(() => {
      expect(addRecentFile).not.toHaveBeenCalled();
      expect(openFileInEditor).not.toHaveBeenCalled();
    });
  });
});
