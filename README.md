# MarkFlow

> A cross-platform WYSIWYG Markdown editor for writers and developers.

MarkFlow is a desktop Markdown editor that combines the immediacy of a WYSIWYG interface with the power of GitHub Flavored Markdown. Files live in your local filesystem — no cloud lock-in, no proprietary formats. Just open a folder and start writing.

---

## Features

- **WYSIWYG Markdown editing** — Type Markdown syntax and see it rendered instantly, Typora-style. No preview pane needed.
- **Full GFM support** — Headings, bold, italic, strikethrough, inline code, code blocks, blockquotes, lists, task lists, tables, links, images, and horizontal rules.
- **Three built-in themes** — Light, dark, and sepia. Switch with a single click.
- **File tree sidebar** — Browse your workspace folder structure, open files, and manage folders.
- **Outline view** — Auto-extracted heading outline (H1–H6) for quick navigation within the current document.
- **Source mode** — Toggle to a plain-text editor to view or edit raw Markdown directly (`Ctrl+/`).
- **Focus mode** — Fade away the toolbar, sidebar, and status bar for distraction-free writing (`Ctrl+Shift+F`).
- **Mermaid diagrams** — Render flowcharts, sequence diagrams, and more from ` ```mermaid ` code blocks.
- **Settings panel** — Configure auto-save, font size, line height, code highlighting, and more.
- **External file watching** — Changes made by other editors are detected automatically. Clean documents reload silently; dirty documents show a conflict dialog.
- **Keyboard shortcuts** — Full shortcut coverage for formatting and view commands.

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Desktop shell | Tauri v2 | Cross-platform native desktop app using the OS WebView |
| Frontend language | TypeScript | UI logic and editor orchestration |
| Editor engine | Tiptap / ProseMirror | Node-based WYSIWYG editing with Markdown bidirectional sync |
| Build tool | Vite | Fast dev server and production bundling |
| Backend | Rust | File I/O, file watching, configuration, Markdown parsing |
| Code highlighting | highlight.js + lowlight | Syntax-highlighted code blocks in the editor |
| Diagrams | Mermaid | Rendering mermaid code blocks as SVG |
| Markdown parsing (Rust) | pulldown-cmark | GFM-to-HTML conversion on the backend |
| File watching (Rust) | notify | Recursive filesystem change detection |

---

## Prerequisites

- **Node.js** 18 or higher
- **Rust** 1.70 or higher
- **OS-specific dependencies** (Linux only):
  ```bash
  sudo apt-get update
  sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
  ```

---

## Installation

```bash
# Clone the repository
git clone https://github.com/your-org/markflow.git
cd markflow

# Install all dependencies (frontend + Tauri CLI)
npm install
```

---

## Development

```bash
# Start the Tauri desktop app in development mode (with HMR)
npm run tauri dev
```

This opens a native desktop window running the MarkFlow app. The frontend hot-reloads on changes.

To run just the frontend dev server (without Tauri):
```bash
npm run dev
# Frontend available at http://localhost:1420
```

---

## Build for Production

```bash
# Build the Tauri desktop app for the current platform
npm run tauri build
```

Build artifacts are produced per platform:

| Platform | Output |
|----------|--------|
| Windows | `.exe` (NSIS installer), `.msi` |
| macOS | `.dmg` (x64 + aarch64 universal) |
| Linux | `.AppImage`, `.deb` |

Installable packages are placed in `src-tauri/target/release/bundle/`.

---

## Project Structure

```
markflow/
├── src/                          # Frontend source (TypeScript + CSS)
│   ├── main.ts                   # Entry point
│   ├── styles/
│   │   ├── main.css              # Main layout, component styles & all theme CSS
│   │   └── variables.css         # CSS custom properties (light/dark/sepia)
│   ├── components/
│   │   ├── toolbar.ts            # Top toolbar (file ops, formatting, modes)
│   │   ├── sidebar.ts           # Sidebar container (tabs, file tree, outline)
│   │   ├── statusbar.ts         # Bottom status bar (stats, quick actions)
│   │   ├── settings.ts          # Settings modal panel
│   │   ├── fileTree.ts          # File tree rendering
│   │   ├── outline.ts           # Document outline extraction
│   │   ├── contextMenu.ts       # Right-click context menu
│   │   ├── toast.ts             # Toast notifications
│   │   └── newFileDialog.ts     # New file / folder dialog
│   ├── lib/
│   │   ├── editor.ts            # Tiptap editor config + Markdown bidirectional sync
│   │   ├── mermaid.ts          # Mermaid diagram rendering setup
│   │   ├── theme.ts            # Theme switching logic
│   │   └── storage.ts          # Tauri IPC wrappers for filesystem
│   └── utils/
│       ├── dom.ts               # DOM helpers
│       └── keyboard.ts          # Keyboard shortcut handling
├── src-tauri/                    # Rust backend source
│   ├── src/
│   │   ├── main.rs               # Tauri application entry
│   │   ├── lib.rs                # Library entry
│   │   ├── commands/
│   │   │   ├── mod.rs
│   │   │   ├── files.rs          # File operation commands
│   │   │   └── settings.rs       # Settings read/write commands
│   │   ├── fs/
│   │   │   ├── mod.rs
│   │   │   ├── watcher.rs        # notify-based file watcher
│   │   │   └── tree.rs           # File tree construction
│   │   ├── config/
│   │   │   ├── mod.rs
│   │   │   └── settings.rs       # Settings struct & persistence
│   │   └── markdown/
│   │       ├── mod.rs
│   │       └── gfm.rs            # pulldown-cmark GFM parser
│   ├── Cargo.toml
│   ├── tauri.conf.json           # Tauri app configuration
│   └── capabilities/             # Tauri v2 permission capabilities
├── docs/
│   ├── product-spec.md           # Product specification (Chinese)
│   ├── technical-design.md       # Architecture & design docs (Chinese)
│   └── ui-design/
│       ├── SPEC.md               # UI/UX specification
│       └── index.html            # Interactive HTML prototype
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## Keyboard Shortcuts

### Formatting

| Shortcut | Action |
|----------|--------|
| `Ctrl+B` | Bold |
| `Ctrl+I` | Italic |
| `Ctrl+Shift+S` | Strikethrough |
| `` Ctrl+` `` | Inline code |
| `Ctrl+K` | Insert link |
| `Ctrl+S` | Save file |

### View & Navigation

| Shortcut | Action |
|----------|--------|
| `Ctrl+\` | Toggle sidebar |
| `Ctrl+/` | Toggle source / WYSIWYG mode |
| `Ctrl+Shift+F` | Toggle focus mode |
| `Ctrl+N` | New file |
| `Ctrl+O` | Open folder |

> On macOS, `Ctrl` maps to `Cmd`.

---

## Themes

MarkFlow ships with three built-in themes. Themes are implemented as CSS custom properties and switched via a `data-theme` attribute on the root element.

| Theme | Description |
|-------|-------------|
| **Light** | Warm white background (`#FAFAF8`) with a warm red accent (`#B5472A`). Default. |
| **Dark** | Dark zinc background (`#18181B`) with a warm orange-red accent (`#E8715A`). |
| **Sepia** | Parchment background (`#F4ECD8`) with brown tones for reduced eye strain. |

The toolbar theme button cycles through themes in order: Light → Dark → Sepia → Light. The active theme is persisted to the settings file.

---

## File Management

MarkFlow operates on real files in real folders — there is no internal project format.

- **Open folder** — Use `Ctrl+O` or the toolbar button to select a workspace folder. All `.md` files are scanned recursively and displayed in the file tree.
- **New file** — `Ctrl+N` or the toolbar button creates a new `.md` file in the current workspace.
- **New folder** — Create a new folder via the sidebar footer action.
- **Open file** — Click any file in the tree to open it in the editor.
- **Rename / Duplicate / Delete** — Right-click a file in the tree to access these actions. Delete requires confirmation.
- **Remember workspace** — The last opened folder is restored on the next launch.

External file changes are handled gracefully:
- If the document has **no unsaved changes**, the file is reloaded automatically.
- If the document is **dirty**, a conflict dialog appears with three choices: keep local changes, load the external version, or manually merge.

---

## Configuration

Settings are stored in a JSON file at the platform-appropriate config directory:

- **Linux/macOS**: `~/.config/MarkFlow/settings.json`
- **Windows**: `%APPDATA%\MarkFlow\settings.json`

### Available Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `theme` | string | `"light"` | Active theme: `light`, `dark`, or `sepia` |
| `follow_system` | boolean | `false` | Automatically match OS dark/light mode |
| `font_size` | number | `18` | Editor font size in pixels |
| `line_height` | number | `1.7` | Editor line height |
| `autosave` | boolean | `true` | Enable auto-save |
| `autosave_interval` | number | `10000` | Auto-save delay in milliseconds |
| `code_highlight` | boolean | `true` | Enable syntax highlighting in code blocks |
| `line_numbers` | boolean | `false` | Show line numbers in source mode |
| `sidebar_visible` | boolean | `true` | Show sidebar on startup |
| `spellcheck` | boolean | `true` | Browser spell check |
| `soft_wrap` | boolean | `true` | Soft word wrapping |

Settings are managed through the in-app Settings panel (gear icon or status bar) and persisted automatically.

---

## License

MIT
