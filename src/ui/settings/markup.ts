// ── Settings panel markup ─────────────────────────────────────────────
// The static HTML for the settings modal. Kept apart from the panel logic so
// the markup can be diffed without wading through event wiring.
import { shortcutLabel } from '../shortcut-hints';

export function createSettingsContent(): string {
  return `
    <div class="modal-settings">
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
              <div class="settings-group-title">文件树性能</div>
              <div class="settings-row">
                <div><div class="settings-label">忽略目录</div><div class="settings-desc">逗号分隔，支持 * 和 ?</div></div>
                <input class="newfile-input" id="setting-filetree-ignore" style="width:240px" />
              </div>
              <div class="settings-row">
                <div class="settings-label">单次加载条目</div>
                <input class="newfile-input" type="number" min="50" max="5000" id="setting-filetree-page-size" style="width:100px" />
              </div>
              <div class="settings-row">
                <div class="settings-label">自动恢复展开深度</div>
                <input class="newfile-input" type="number" min="1" max="32" id="setting-filetree-depth" style="width:100px" />
              </div>
            </div>
            <div class="settings-group">
              <div class="settings-group-title">文档大小/行数上限</div>
              <div class="settings-subfield">
                <div class="settings-label">所见即所得上限</div>
                <div class="settings-row">
                  <div><div class="settings-label">准入体积上限（KB）</div><div class="settings-desc">超过此体积的新文档保留在源码模式</div></div>
                  <input class="newfile-input" type="number" min="1" id="setting-wysiwyg-admission-kb" style="width:100px" />
                </div>
                <div class="settings-row">
                  <div class="settings-label">准入行数上限</div>
                  <input class="newfile-input" type="number" min="1" id="setting-wysiwyg-admission-lines" style="width:100px" />
                </div>
                <div class="settings-row">
                  <div><div class="settings-label">节点数上限</div><div class="settings-desc">超过后限制部分编辑功能</div></div>
                  <input class="newfile-input" type="number" min="1" id="setting-wysiwyg-max-nodes" style="width:100px" />
                </div>
                <div class="settings-row">
                  <div class="settings-label">文本长度上限（字符）</div>
                  <input class="newfile-input" type="number" min="1" id="setting-wysiwyg-max-text-length" style="width:100px" />
                </div>
              </div>
              <div class="settings-subfield">
                <div class="settings-label">大文件档位</div>
                <div class="settings-row">
                  <div><div class="settings-label">大文件体积阈值（KB）</div><div class="settings-desc">修改仅对新打开的文档生效</div></div>
                  <input class="newfile-input" type="number" min="1" id="setting-large-file-kb" style="width:100px" />
                </div>
                <div class="settings-row">
                  <div class="settings-label">超大文件体积阈值（KB）</div>
                  <input class="newfile-input" type="number" min="1" id="setting-huge-file-kb" style="width:100px" />
                </div>
                <div class="settings-row">
                  <div class="settings-label">大文件行数阈值</div>
                  <input class="newfile-input" type="number" min="1" id="setting-large-file-lines" style="width:100px" />
                </div>
                <div class="settings-row">
                  <div class="settings-label">超大文件行数阈值</div>
                  <input class="newfile-input" type="number" min="1" id="setting-huge-file-lines" style="width:100px" />
                </div>
              </div>
              <div class="settings-limits-error" id="setting-document-limits-error" hidden></div>
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
                  <option value="1.6" selected>1.6（标准）</option>
                  <option value="1.7">1.7（舒展）</option>
                  <option value="1.8">1.8（宽松）</option>
                  <option value="2.0">2.0（双倍）</option>
                </select>
              </div>
            </div>
          </div>
          <div id="panel-editor" class="settings-panel" hidden>
            <div class="settings-group">
              <div class="settings-group-title">编辑器</div>
              <div class="settings-row">
                <div class="settings-label">拼写检查</div>
                <button class="toggle active" id="setting-spellcheck"></button>
              </div>
              <div class="settings-row">
                <div>
                  <div class="settings-label">自动换行</div>
                  <div class="settings-desc">长行在所见即所得与源码模式中自动折行；关闭后横向滚动</div>
                </div>
                <button class="toggle active" id="setting-softwrap"></button>
              </div>
            </div>
            <div class="settings-group">
              <div class="settings-group-title">代码块</div>
              <div class="settings-row">
                <div>
                  <div class="settings-label">代码高亮</div>
                  <div class="settings-desc">在所见即所得和源码模式中高亮代码语法</div>
                </div>
                <button class="toggle active" id="setting-codehighlight"></button>
              </div>
              <div class="settings-row">
                <div>
                  <div class="settings-label">代码块行号</div>
                  <div class="settings-desc">在代码块左侧显示行号</div>
                </div>
                <button class="toggle" id="setting-code-linenumbers"></button>
              </div>
              <div class="settings-row">
                <div class="settings-label">代码块自动换行</div>
                <button class="toggle active" id="setting-code-wordwrap"></button>
              </div>
            </div>
            <div class="settings-group">
              <div class="settings-group-title">PlantUML</div>
              <div class="settings-field">
                <label class="settings-label" for="setting-plantuml-server-url">PlantUML 服务器地址</label>
                <div class="settings-warning">
                  ⚠ 使用外部 PlantUML 服务器会将图表文本发送给第三方，存在隐私与数据外泄风险；敏感内容请使用自建服务器。
                  <span class="settings-copy-hint">默认服务器（请自行复制）：<code>https://www.plantuml.com/plantuml</code></span>
                </div>
                <input class="newfile-input settings-input-full" id="setting-plantuml-server-url" placeholder="粘贴 PlantUML 服务器地址" />
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
              <div class="settings-field">
                <div>
                  <label class="settings-label" for="setting-image-storage">插入图片时</label>
                  <div class="settings-desc">剪贴板图片始终保存到这里；本地和网络图片可分别选择是否保存</div>
                </div>
                <select class="settings-select settings-control-full" id="setting-image-storage">
                  <option value="custom" selected>复制到指定路径（默认）</option>
                  <option value="document-dir">复制到当前文件夹 ./（和文档同级）</option>
                  <option value="document-named-dir">复制到 ./\${filename}-images</option>
                </select>
              </div>
              <div class="settings-field settings-subfield" id="setting-image-custom-row">
                <div>
                  <label class="settings-label" for="setting-image-custom-path">指定路径</label>
                  <div class="settings-desc">支持相对路径（相对于文档）、绝对路径、Windows 盘符路径和 UNC 路径</div>
                </div>
                <div class="settings-path-control">
                  <input class="newfile-input" id="setting-image-custom-path" placeholder="./images, ../assets, /absolute/path, D:&#92;Pictures" />
                  <button class="settings-button" id="setting-image-choose-folder" type="button" aria-label="选择图片存储文件夹">选择文件夹…</button>
                </div>
              </div>
              <div class="settings-desc settings-rule-example" id="setting-image-named-dir-help" hidden><code>\${filename}</code> 不含 <code>.md</code> 扩展名，例如 <code>guide.md → ./guide-images/</code></div>
            </div>
            <div class="settings-group">
              <div class="settings-group-title">应用范围</div>
              <div class="settings-row">
                <div>
                  <div class="settings-label">对本地图片应用</div>
                  <div class="settings-desc">开启后将本地图片复制到上述位置；关闭则保留原始路径</div>
                </div>
                <button class="toggle active" id="setting-image-apply-local" type="button"></button>
              </div>
              <div class="settings-row">
                <div>
                  <div class="settings-label">对网络图片应用</div>
                  <div class="settings-desc">开启后将网络图片下载到上述位置；关闭则保留原始 URL</div>
                </div>
                <button class="toggle active" id="setting-image-apply-network" type="button"></button>
              </div>
            </div>
            <div class="settings-group">
              <div class="settings-group-title">引用路径</div>
              <div class="settings-field">
                <div>
                  <div class="settings-label">Markdown 引用样式</div>
                  <div class="settings-desc">图片在 Markdown 中的路径引用格式</div>
                </div>
                <select class="settings-select settings-control-full" id="setting-image-reference-style">
                  <option value="relative" selected>相对路径（推荐）</option>
                  <option value="absolute">绝对路径</option>
                </select>
              </div>
            </div>
            <div class="settings-group">
              <div class="settings-group-title">剪贴板图片命名</div>
              <div class="settings-field">
                <div>
                  <label class="settings-label" for="setting-image-clipboard-template">文件名模板</label>
                  <div class="settings-desc">仅用于剪贴板图片；扩展名自动保留原始格式，只有重名时才追加序号</div>
                </div>
                <input class="newfile-input settings-input-full" id="setting-image-clipboard-template" value="img-\${date:yyyyMMdd}\${time:HHmmss}" />
                <div class="settings-template-help">
                  可用变量：<code>\${filename}</code> 当前文档文件名（不含扩展名），<code>\${date:yyyyMMdd}</code> 日期，<code>\${time:HHmmss}</code> 时间。
                  未保存文档的 <code>\${filename}</code> 为 <code>untitled</code>。
                </div>
              </div>
            </div>
          </div>
          <div id="panel-shortcuts" class="settings-panel" hidden>
            <div class="settings-group">
              <div class="settings-group-title">格式化</div>
              <div class="shortcuts-grid">
                <div class="shortcut-row"><span>粗体</span><span class="shortcut-key">${shortcutLabel('Mod+B')}</span></div>
                <div class="shortcut-row"><span>斜体</span><span class="shortcut-key">${shortcutLabel('Mod+I')}</span></div>
                <div class="shortcut-row"><span>删除线</span><span class="shortcut-key">${shortcutLabel('Shift+Mod+S')}</span></div>
                <div class="shortcut-row"><span>行内代码</span><span class="shortcut-key">${shortcutLabel('Mod+`')}</span></div>
                <div class="shortcut-row"><span>链接</span><span class="shortcut-key">${shortcutLabel('Mod+K')}</span></div>
                <div class="shortcut-row"><span>保存</span><span class="shortcut-key">${shortcutLabel('Mod+S')}</span></div>
              </div>
            </div>
            <div class="settings-group">
              <div class="settings-group-title">视图</div>
              <div class="shortcuts-grid">
                <div class="shortcut-row"><span>切换侧边栏</span><span class="shortcut-key">${shortcutLabel('Mod+\\')}</span></div>
                <div class="shortcut-row"><span>专注模式</span><span class="shortcut-key">${shortcutLabel('Shift+Mod+F')}</span></div>
                <div class="shortcut-row"><span>源码模式</span><span class="shortcut-key">${shortcutLabel('Mod+/')}</span></div>
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
}
