import { setTheme } from '../lib/theme';
import { loadSettings, saveSettings } from '../lib/storage';
import { logException } from '../lib/logger';

type Theme = 'light' | 'dark' | 'sepia';

type SettingsState = Record<string, unknown>;

const DEFAULT_SETTINGS: SettingsState = {
  version: 1,
  theme: 'light',
  fontSize: 18,
  lineHeight: 1.7,
  autosave: true,
  autosaveInterval: 10000,
  spellcheck: true,
  softWrap: true,
  livePreview: true,
  codeHighlight: true,
  lineNumbers: false,
  showSidebar: true,
  showTooltips: true,
  followSystemTheme: false,
  lastWorkspace: null,
  imageStorageMode: 'workspace-assets',
  imageCustomPath: '',
  imagePreferRelative: true,
  imageAutoCopyLocal: true,
  imageDownloadNetwork: false,
  imageNamingStrategy: 'timestamp',
};

let currentSettings: SettingsState = { ...DEFAULT_SETTINGS };

export function initSettings() {
  const overlay = document.getElementById('settings-modal');
  if (!overlay) return;

  overlay.innerHTML = `
    <div class="modal modal-settings">
      <div class="modal-header">
        <span>设置</span>
        <button class="modal-close" id="settings-close">✕</button>
      </div>
      <div class="settings-body">
        <div class="settings-tabs">
          <button class="settings-tab active" data-panel="general">通用</button>
          <button class="settings-tab" data-panel="appearance">外观</button>
          <button class="settings-tab" data-panel="editor">编辑器</button>
          <button class="settings-tab" data-panel="image">图片</button>
          <button class="settings-tab" data-panel="shortcuts">快捷键</button>
        </div>
        <div class="settings-panels">
          <div id="panel-general" class="settings-panel">
            <div class="settings-group">
              <div class="settings-group-title">文件</div>
              <div class="settings-row">
                <div>
                  <div class="settings-label">自动保存</div>
                  <div class="settings-desc">编辑时自动保存到文件系统</div>
                </div>
                <button class="toggle active" id="setting-autosave"></button>
              </div>
              <div class="settings-row">
                <div>
                  <div class="settings-label">自动保存间隔</div>
                </div>
                <select class="settings-select" id="setting-autosave-interval">
                  <option value="5000">5 秒</option>
                  <option value="10000" selected>10 秒</option>
                  <option value="30000">30 秒</option>
                  <option value="60000">60 秒</option>
                </select>
              </div>
            </div>
            <div class="settings-group">
              <div class="settings-group-title">编辑器</div>
              <div class="settings-row">
                <div class="settings-label">拼写检查</div>
                <button class="toggle active" id="setting-spellcheck"></button>
              </div>
              <div class="settings-row">
                <div class="settings-label">自动换行</div>
                <button class="toggle active" id="setting-softwrap"></button>
              </div>
            </div>
          </div>
          <div id="panel-appearance" class="settings-panel" hidden>
            <div class="settings-group">
              <div class="settings-group-title">主题</div>
              <div class="theme-swatches">
                <div class="theme-swatch selected" data-theme="light" id="theme-light-preview">
                  <div class="theme-swatch-colors">
                    <div class="theme-swatch-color" style="background:#FAFAF8"></div>
                    <div class="theme-swatch-color" style="background:#FFFFFF"></div>
                    <div class="theme-swatch-color" style="background:#B5472A"></div>
                  </div>
                  <span class="theme-swatch-label">浅色</span>
                </div>
                <div class="theme-swatch" data-theme="dark" id="theme-dark-preview">
                  <div class="theme-swatch-colors">
                    <div class="theme-swatch-color" style="background:#18181B"></div>
                    <div class="theme-swatch-color" style="background:#1F1F23"></div>
                    <div class="theme-swatch-color" style="background:#E8715A"></div>
                  </div>
                  <span class="theme-swatch-label">深色</span>
                </div>
                <div class="theme-swatch" data-theme="sepia" id="theme-sepia-preview">
                  <div class="theme-swatch-colors">
                    <div class="theme-swatch-color" style="background:#F4ECD8"></div>
                    <div class="theme-swatch-color" style="background:#FAF6ED"></div>
                    <div class="theme-swatch-color" style="background:#8B6914"></div>
                  </div>
                  <span class="theme-swatch-label">护眼</span>
                </div>
              </div>
              <div class="settings-row">
                <div class="settings-label">跟随系统主题</div>
                <button class="toggle" id="setting-follow-system"></button>
              </div>
            </div>
            <div class="settings-group">
              <div class="settings-group-title">字体与排版</div>
              <div class="settings-row">
                <div class="settings-label">正文字号</div>
                <select class="settings-select" id="setting-fontsize">
                  <option value="14">14px</option>
                  <option value="16">16px</option>
                  <option value="18" selected>18px</option>
                  <option value="20">20px</option>
                  <option value="22">22px</option>
                </select>
              </div>
              <div class="settings-row">
                <div class="settings-label">行高</div>
                <select class="settings-select" id="setting-lineheight">
                  <option value="1.5">1.5（紧凑）</option>
                  <option value="1.7" selected>1.7（标准）</option>
                  <option value="1.8">1.8（宽松）</option>
                  <option value="2.0">2.0（双倍）</option>
                </select>
              </div>
            </div>
          </div>
          <div id="panel-editor" class="settings-panel" hidden>
            <div class="settings-group">
              <div class="settings-group-title">Markdown</div>
              <div class="settings-row">
                <div class="settings-label">实时预览</div>
                <button class="toggle active" id="setting-livepreview"></button>
              </div>
              <div class="settings-row">
                <div class="settings-label">代码高亮</div>
                <button class="toggle active" id="setting-codehighlight"></button>
              </div>
              <div class="settings-row">
                <div class="settings-label">显示行号</div>
                <button class="toggle" id="setting-linenumbers"></button>
              </div>
            </div>
            <div class="settings-group">
              <div class="settings-group-title">界面</div>
              <div class="settings-row">
                <div class="settings-label">默认展开侧边栏</div>
                <button class="toggle active" id="setting-sidebar"></button>
              </div>
              <div class="settings-row">
                <div class="settings-label">工具栏提示</div>
                <button class="toggle active" id="setting-tooltips"></button>
              </div>
            </div>
          </div>
          <div id="panel-image" class="settings-panel" hidden>
            <div class="settings-group">
              <div class="settings-group-title">存储</div>
              <div class="settings-row">
                <div>
                  <div class="settings-label">存放位置</div>
                  <div class="settings-desc">粘贴或拖入图片的保存位置</div>
                </div>
                <select class="settings-select" id="setting-image-storage">
                  <option value="workspace-assets" selected>工作区 assets/</option>
                  <option value="doc-assets">与文档同级 assets/</option>
                  <option value="custom">自定义路径</option>
                  <option value="none">无特殊操作</option>
                </select>
              </div>
              <div class="settings-row" id="setting-image-custom-row" hidden>
                <div>
                  <div class="settings-label">自定义路径</div>
                  <div class="settings-desc">支持相对路径，如 ./assets</div>
                </div>
                <input class="newfile-input" id="setting-image-custom-path" style="width:200px" placeholder="./images" />
              </div>
            </div>
            <div class="settings-group">
              <div class="settings-group-title">路径与行为</div>
              <div class="settings-row">
                <div>
                  <div class="settings-label">优先使用相对路径</div>
                  <div class="settings-desc">Markdown 中使用相对路径引用图片</div>
                </div>
                <button class="toggle active" id="setting-image-relative"></button>
              </div>
              <div class="settings-row">
                <div>
                  <div class="settings-label">对本地图片应用</div>
                  <div class="settings-desc">粘贴/拖入本地图片时复制到存储位置</div>
                </div>
                <button class="toggle active" id="setting-image-auto-copy"></button>
              </div>
              <div class="settings-row">
                <div>
                  <div class="settings-label">对网络图片应用</div>
                  <div class="settings-desc">插入网络图片时下载到本地</div>
                </div>
                <button class="toggle" id="setting-image-download"></button>
              </div>
            </div>
            <div class="settings-group">
              <div class="settings-group-title">命名</div>
              <div class="settings-row">
                <div>
                  <div class="settings-label">文件命名策略</div>
                  <div class="settings-desc">截图粘贴时自动生成文件名</div>
                </div>
                <select class="settings-select" id="setting-image-naming">
                  <option value="original">原文件名</option>
                  <option value="timestamp" selected>时间戳</option>
                  <option value="sequence">自动序号</option>
                </select>
              </div>
            </div>
          </div>
          <div id="panel-shortcuts" class="settings-panel" hidden>
            <div class="settings-group">
              <div class="settings-group-title">格式化</div>
              <div class="shortcuts-grid">
                <div class="shortcut-row"><span>粗体</span><span class="shortcut-key">Ctrl+B</span></div>
                <div class="shortcut-row"><span>斜体</span><span class="shortcut-key">Ctrl+I</span></div>
                <div class="shortcut-row"><span>删除线</span><span class="shortcut-key">Ctrl+Shift+S</span></div>
                <div class="shortcut-row"><span>行内代码</span><span class="shortcut-key">Ctrl+&#96;</span></div>
                <div class="shortcut-row"><span>链接</span><span class="shortcut-key">Ctrl+K</span></div>
                <div class="shortcut-row"><span>保存</span><span class="shortcut-key">Ctrl+S</span></div>
              </div>
            </div>
            <div class="settings-group">
              <div class="settings-group-title">视图</div>
              <div class="shortcuts-grid">
                <div class="shortcut-row"><span>切换侧边栏</span><span class="shortcut-key">Ctrl+\\</span></div>
                <div class="shortcut-row"><span>专注模式</span><span class="shortcut-key">Ctrl+Shift+F</span></div>
                <div class="shortcut-row"><span>源码模式</span><span class="shortcut-key">Ctrl+/</span></div>
              </div>
            </div>
            <div style="text-align:center;padding:16px;color:var(--muted);font-size:12px;">
              MarkFlow v1.0.0 · 所见即所得 Markdown 编辑器
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  bindSettingsEvents();
  void hydrateSettingsUI();
}

function bindSettingsEvents() {
  document.getElementById('settings-close')?.addEventListener('click', () => {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.hidden = true;
  });

  document.getElementById('settings-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      (e.target as HTMLElement).hidden = true;
    }
  });

  document.querySelectorAll('.settings-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const panel = (tab as HTMLElement).dataset.panel;
      document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.settings-panel').forEach(p => {
        (p as HTMLElement).hidden = p.id !== `panel-${panel}`;
      });
    });
  });

  document.querySelectorAll('.toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      toggle.classList.toggle('active');
      void persistSettingsFromUI();
    });
  });

  document.querySelectorAll('.theme-swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
      const theme = (swatch as HTMLElement).dataset.theme as Theme;
      document.querySelectorAll('.theme-swatch').forEach(s => s.classList.remove('selected'));
      swatch.classList.add('selected');
      setTheme(theme);
      void persistSettingsFromUI();
    });
  });

  const storageSelect = document.getElementById('setting-image-storage') as HTMLSelectElement | null;
  const customRow = document.getElementById('setting-image-custom-row');
  if (storageSelect && customRow) {
    storageSelect.addEventListener('change', () => {
      customRow.hidden = storageSelect.value !== 'custom';
      void persistSettingsFromUI();
    });
  }

  document.querySelectorAll('.settings-select').forEach(select => {
    select.addEventListener('change', () => {
      void persistSettingsFromUI();
    });
  });

  document.getElementById('setting-image-custom-path')?.addEventListener('input', () => {
    void persistSettingsFromUI();
  });
}

async function hydrateSettingsUI() {
  try {
    const loaded = await loadSettings();
    currentSettings = { ...DEFAULT_SETTINGS, ...loaded };
  } catch (e) {
    logException('settings.ui', 'Failed to load settings UI state', e);
    currentSettings = { ...DEFAULT_SETTINGS };
  }

  applySettingsToUI(currentSettings);
  applyRuntimeSettings(currentSettings);
}

function applySettingsToUI(settings: SettingsState) {
  setToggleState('setting-autosave', settings.autosave !== false);
  setSelectValue('setting-autosave-interval', String(settings.autosaveInterval ?? 10000));
  setToggleState('setting-spellcheck', settings.spellcheck !== false);
  setToggleState('setting-softwrap', settings.softWrap !== false);
  setToggleState('setting-livepreview', settings.livePreview !== false);
  setToggleState('setting-codehighlight', settings.codeHighlight !== false);
  setToggleState('setting-linenumbers', settings.lineNumbers === true);
  setToggleState('setting-sidebar', settings.showSidebar !== false);
  setToggleState('setting-tooltips', settings.showTooltips !== false);
  setToggleState('setting-follow-system', settings.followSystemTheme === true);

  setSelectValue('setting-fontsize', String(settings.fontSize ?? 18));
  setSelectValue('setting-lineheight', String(settings.lineHeight ?? 1.7));
  setSelectValue('setting-image-storage', String(settings.imageStorageMode ?? 'workspace-assets'));
  setInputValue('setting-image-custom-path', String(settings.imageCustomPath ?? ''));
  setToggleState('setting-image-relative', settings.imagePreferRelative !== false);
  setToggleState('setting-image-auto-copy', settings.imageAutoCopyLocal !== false);
  setToggleState('setting-image-download', settings.imageDownloadNetwork === true);
  setSelectValue('setting-image-naming', String(settings.imageNamingStrategy ?? 'timestamp'));

  const selectedTheme = String(settings.theme ?? 'light') as Theme;
  document.querySelectorAll('.theme-swatch').forEach(swatch => {
    swatch.classList.toggle('selected', (swatch as HTMLElement).dataset.theme === selectedTheme);
  });

  const customRow = document.getElementById('setting-image-custom-row');
  if (customRow) {
    customRow.hidden = getSelectValue('setting-image-storage') !== 'custom';
  }
}

function applyRuntimeSettings(settings: SettingsState) {
  setTheme(String(settings.theme ?? 'light') as Theme);

  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    sidebar.classList.toggle('collapsed', settings.showSidebar === false);
  }

  const sourceEditor = document.getElementById('source-editor') as HTMLTextAreaElement | null;
  if (sourceEditor) {
    sourceEditor.spellcheck = settings.spellcheck !== false;
    sourceEditor.style.fontSize = `${Number(settings.fontSize ?? 18)}px`;
    sourceEditor.style.lineHeight = String(settings.lineHeight ?? 1.7);
    sourceEditor.style.whiteSpace = settings.softWrap === false ? 'pre' : 'pre-wrap';
  }

  const wysiwygEditor = document.getElementById('wysiwyg-editor');
  if (wysiwygEditor) {
    const root = wysiwygEditor.querySelector('.ProseMirror') as HTMLElement | null;
    if (root) {
      root.spellcheck = settings.spellcheck !== false;
      root.style.fontSize = `${Number(settings.fontSize ?? 18)}px`;
      root.style.lineHeight = String(settings.lineHeight ?? 1.7);
      root.style.whiteSpace = settings.softWrap === false ? 'pre' : 'normal';
    }
  }
}

async function persistSettingsFromUI() {
  const uiSettings = buildSettingsFromUI();

  try {
    const persisted = await loadSettings();
    currentSettings = { ...persisted, ...uiSettings };
    applyRuntimeSettings(currentSettings);
    await saveSettings(currentSettings);
    document.dispatchEvent(new CustomEvent('settings-changed', {
      detail: { ...currentSettings },
    }));
  } catch (e) {
    logException('settings.ui', 'Failed to save settings', e);
  }
}

function buildSettingsFromUI(): SettingsState {
  return {
    ...currentSettings,
    version: 1,
    theme: getSelectedTheme(),
    fontSize: Number(getSelectValue('setting-fontsize') || 18),
    lineHeight: Number(getSelectValue('setting-lineheight') || 1.7),
    autosave: getToggleState('setting-autosave'),
    autosaveInterval: Number(getSelectValue('setting-autosave-interval') || 10000),
    spellcheck: getToggleState('setting-spellcheck'),
    softWrap: getToggleState('setting-softwrap'),
    livePreview: getToggleState('setting-livepreview'),
    codeHighlight: getToggleState('setting-codehighlight'),
    lineNumbers: getToggleState('setting-linenumbers'),
    showSidebar: getToggleState('setting-sidebar'),
    showTooltips: getToggleState('setting-tooltips'),
    followSystemTheme: getToggleState('setting-follow-system'),
    imageStorageMode: getSelectValue('setting-image-storage') || 'workspace-assets',
    imageCustomPath: getInputValue('setting-image-custom-path'),
    imagePreferRelative: getToggleState('setting-image-relative'),
    imageAutoCopyLocal: getToggleState('setting-image-auto-copy'),
    imageDownloadNetwork: getToggleState('setting-image-download'),
    imageNamingStrategy: getSelectValue('setting-image-naming') || 'timestamp',
  };
}

function getSelectedTheme(): Theme {
  const selected = document.querySelector('.theme-swatch.selected') as HTMLElement | null;
  return (selected?.dataset.theme as Theme) || 'light';
}

function getToggleState(id: string) {
  return document.getElementById(id)?.classList.contains('active') === true;
}

function setToggleState(id: string, active: boolean) {
  document.getElementById(id)?.classList.toggle('active', active);
}

function getSelectValue(id: string) {
  return (document.getElementById(id) as HTMLSelectElement | null)?.value || '';
}

function setSelectValue(id: string, value: string) {
  const el = document.getElementById(id) as HTMLSelectElement | null;
  if (el) el.value = value;
}

function getInputValue(id: string) {
  return (document.getElementById(id) as HTMLInputElement | null)?.value || '';
}

function setInputValue(id: string, value: string) {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (el) el.value = value;
}
