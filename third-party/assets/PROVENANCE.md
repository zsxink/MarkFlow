# Bundled Asset Provenance

Covers every graphic asset that ships inside the MarkFlow installer. The goal is
that a reviewer can answer "where did this come from and may we redistribute it?"
without archaeology.

Verify the checksums with:

```bash
shasum -a 256 assets/* src-tauri/assets/* src-tauri/icons/icon.icns src-tauri/icons/icon.png src-tauri/icons/32x32.png
```

## Summary

| Asset | Origin | License | Redistributable |
| --- | --- | --- | --- |
| `assets/markflow-icon-256.png`, `assets/icon.ico`, `assets/128x128@2x.ico`, `src-tauri/icons/*` | MarkFlow original artwork | MIT (project `LICENSE`) | Yes |
| `assets/markflow-wordmark.svg`, `assets/markflow-wordmark.png` | MarkFlow original artwork | MIT (project `LICENSE`) | Yes |
| `assets/dmg-background.svg` → `src-tauri/assets/dmg-background.png` | MarkFlow original artwork | MIT (project `LICENSE`) | Yes |
| Inline toolbar SVG icons in `index.html` | Derived from Feather Icons | MIT | Yes |

## MarkFlow original artwork

All of the following are original work created for this project, so they are
covered by the repository `LICENSE` (MIT) and carry no third-party obligation.

### Application icon

| File | sha256 |
| --- | --- |
| `assets/markflow-icon-256.png` | `68401676ffb4b1e0df0a8c10665077e816b471d752248369dae25efd8107101f` |
| `assets/icon.ico` | `d81753a0073d65a9010326457afdb31b3f016ce8b158ca7f9e89ccaf905f9132` |
| `assets/128x128@2x.ico` | `d81753a0073d65a9010326457afdb31b3f016ce8b158ca7f9e89ccaf905f9132` |
| `src-tauri/icons/icon.icns` | `4dacb31e5c1ec43cc311c3d41fd6006ff50b4097f02cb6ef78552475b0cfc2be` |
| `src-tauri/icons/icon.png` | `c41b9bba2c58701884365b01151556de23bda526ac81d71ca550fdb783053b53` |
| `src-tauri/icons/32x32.png` | `8a5f41a0bf80f0eb16269d7f2cd6b7bffc16001a178f587eb6a95df257c95cc6` |

The `src-tauri/icons/` set (including the Windows Store `Square*Logo.png` and
`StoreLogo.png` variants, plus the `android/` and `ios/` subdirectories) is
generated from the same source artwork with `npx tauri icon`. There is no
third-party icon pack involved: the mark is a stylised "M" drawn on the terracotta
brand colour, authored in-house.

### Wordmark

| File | sha256 |
| --- | --- |
| `assets/markflow-wordmark.svg` | `220b44eb91e5165664eb7b85eb2fb8595b72a09f019c6fc4a4d1906aa7bdffa3` |
| `assets/markflow-wordmark.png` | `e667867390d1d84872b58c6541ffe3e63adddfeab1909d1d99d976eae80596f3` |

The SVG is the design source; the PNG is its rasterised form used by the READMEs.
Both are original.

### DMG installer background

| File | sha256 | Role |
| --- | --- | --- |
| `assets/dmg-background.svg` | `138101f10db29de6a1affed0b280ccf22dbc39dc8e71653d4ed19878b0747149` | design source (1×, 660×400) |
| `src-tauri/assets/dmg-background.png` | `665a5660b0a45de2d45aac581191fabc4ab600f7c7163d5ae0532a10e5042cf7` | packaged bitmap |

Original. Regenerate with `npm run build:dmg-background`
(`scripts/build-dmg-background.mjs`, uses `sharp`). The canvas size is contractually
tied to `bundle.macOS.dmg.windowSize` in `src-tauri/tauri.conf.json` — see the
`dmg-installer-appearance` spec.

## Inline toolbar icons — Feather Icons

The toolbar and dialog SVGs embedded in `index.html` are adapted from
[Feather Icons](https://github.com/feathericons/feather) (v4.x line), redrawn at
the project's 24×24 / 2px-stroke grid. Feather ships under the MIT license:

```
The MIT License (MIT)

Copyright (c) 2013-2023 Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Feather's MIT terms are the same license already bundled as
`third-party/texts/MIT.txt`, so no extra text file is needed; this notice is the
attribution that MIT requires.

Icons used (Feather name → where it appears): `sidebar`, `folder`, `file-text`,
`file-plus`, `save`, `download`, `settings`, `bold`, `italic`, `link`, `list`,
`code`, `image`, `type`, `minus-square`, plus hand-drawn additions (`H1`/`H2`
text glyphs, the strikethrough and blockquote shapes, and the frontmatter icon)
that are original.

## What is *not* here

- **KaTeX fonts** (`dist/assets/KaTeX_*.woff2`): bundled by the `katex` npm
  dependency, not vendored into this repo. Covered by the generated inventory
  (`third-party/inventory.npm.json`, `katex` entry) and its MIT license text.
- **Syntax highlighting themes**: colour values only, no third-party asset files.
