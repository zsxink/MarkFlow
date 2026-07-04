# MarkFlow

> A cross-platform WYSIWYG Markdown editor for writers and developers.

MarkFlow lets you write Markdown as if it were rich text. Type and see it rendered instantly — no preview pane needed. Files live in your local filesystem with no cloud lock-in and no proprietary formats. Just open a folder and start writing.

---

![](assets/markflow-wordmark.png)

## Features

- **WYSIWYG editing** — Markdown syntax renders in real-time, similar to Typora
- **Full GFM support** — Headings, bold, italic, strikethrough, inline code, code blocks, blockquotes, lists, task lists, tables, links, images, and horizontal rules
- **Image support** — Insert via toolbar, paste from clipboard, drag-and-drop, or manual syntax. Supports local and network images
- **Three built-in themes** — Light, dark, and sepia. Switch with one click
- **File tree sidebar** — Browse your workspace folder structure and manage files
- **Outline view** — Auto-extracted heading hierarchy for quick document navigation
- **Source mode** — Toggle to a plain-text editor for raw Markdown (`Ctrl+/`)
- **Focus mode** — Hide toolbar, sidebar, and status bar for distraction-free writing (`Ctrl+Shift+F`)
- **Mermaid diagrams** — Write Mermaid syntax in code blocks, rendered as diagrams automatically
- **Settings panel** — Configure auto-save, font size, line height, code highlighting, image storage, and more
- **External file watching** — Detects changes from other editors. Clean documents reload silently; dirty documents show a conflict dialog

---

## Quick Start

### Prerequisites

- **Node.js** 18+

- **Rust** 1.70+

- **Linux dependencies**:

  ```bash
  sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
  ```

### Installation

```bash
git clone https://github.com/your-org/markflow.git
cd markflow
npm install
```

### Development

```bash
npm run tauri dev
```

### Build for Production

```bash
npm run tauri build
```

Build artifacts are placed in `src-tauri/target/release/bundle/`:

| Platform | Output |
| --- | --- |
| Windows | `.exe` (NSIS installer), `.msi` |
| macOS | `.dmg` (Apple Silicon) |
| Linux | `.AppImage`, `.deb` |

---

## Usage

### File Management

- **Open folder** — `Ctrl+O` or toolbar button to select a workspace folder
- **New file** — `Ctrl+N` or toolbar button
- **New folder** — Sidebar footer button
- **Open file** — Click a file in the tree
- **Rename / Duplicate / Delete** — Right-click a file in the tree
- **Remember workspace** — Restores the last opened folder on next launch

### Inserting Images

Four ways to insert images:

1. **Toolbar button** — Click the image icon, pick a local file or enter a URL
2. **Paste** — Paste a screenshot or image from clipboard (`Ctrl+V`)
3. **Drag and drop** — Drop an image file into the editor
4. **Manual syntax** — Type `![alt](path)` in source mode

Image storage location is configurable in settings: workspace `assets/`, doc-level `assets/`, custom path, or no-op.

### Keyboard Shortcuts

#### Formatting

| Shortcut | Action |
| --- | --- |
| `Ctrl+B` | Bold |
| `Ctrl+I` | Italic |
| `Ctrl+Shift+S` | Strikethrough |
| `` Ctrl+` `` | Inline code |
| `Ctrl+K` | Insert link |
| `Ctrl+S` | Save file |

#### View & Navigation

| Shortcut | Action |
| --- | --- |
| `Ctrl+\` | Toggle sidebar |
| `Ctrl+/` | Toggle source / WYSIWYG mode |
| `Ctrl+Shift+F` | Toggle focus mode |

> On macOS, `Ctrl` maps to `Cmd`.

### Themes

Three built-in themes, switchable via the toolbar theme button or settings:

| Theme | Description |
| --- | --- |
| **Light** | Warm white background. Default. |
| **Dark** | Dark background for night use. |
| **Sepia** | Parchment tones for reduced eye strain. |

### Settings

Open via the toolbar gear icon or status bar. Available options:

- Auto-save toggle and interval
- Font size and line height
- Code highlighting and line numbers
- Spellcheck and word wrap
- Theme and follow-system-theme
- Image storage strategy and naming

Settings file location:

- **Windows**: `%APPDATA%\MarkFlow\settings.json`
- **macOS / Linux**: `~/.config/MarkFlow/settings.json`

---

---

## Project Documentation

| Document | Description | Location |
| --- | --- | --- |
| Product Spec | Product positioning, feature list, acceptance criteria | `openspec/specs/product-spec.md` |
| Architecture | Tech stack, project structure, architecture overview | `openspec/specs/architecture.md` |
| Technical Design | Architecture details, component design, key implementations | `openspec/specs/technical-design.md` |
| UI Design Spec | Pixel-level UI specification | `openspec/ui-design/SPEC.md` |
| UI Fixes Record | CSS layout experience and fix checklist | `openspec/specs/ui-fixes-spec.md` |

> `openspec/specs/` is the canonical spec source.

## License

MIT