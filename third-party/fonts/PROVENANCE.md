# Bundled Font Provenance

Recorded so the licence position of every font in `src/assets/fonts/` is
auditable without re-deriving it. Verify the checksums with:

```bash
shasum -a 256 src/assets/fonts/*.woff2
```

## Summary

| Bundled file | Upstream | Modified? | Family name in app |
| --- | --- | --- | --- |
| `SourceSerif4-Regular.ttf.woff2` | Source Serif 4.005R (TTF) | Format conversion only | `Source Serif 4` |
| `SourceSerif4SmText-It.ttf.woff2` | Source Serif 4.005R (TTF) | Format conversion only | `Source Serif 4` |
| `SourceSerif4-Bold.ttf.woff2` | Source Serif 4.005R (TTF) | Format conversion only | `Source Serif 4` |
| `SourceSerif4-BoldIt.ttf.woff2` | Source Serif 4.005R (TTF) | Format conversion only | `Source Serif 4` |
| `SourceHanSerifSC-Regular-common.woff2` | Source Han Serif SC 2.003R (OTF) | Subsetted + renamed | `MarkFlow Serif SC` |
| `SourceHanSerifSC-Bold-common.woff2` | Source Han Serif SC 2.003R (OTF) | Subsetted + renamed | `MarkFlow Serif SC` |

All six are licensed under the **SIL Open Font License 1.1**. The license text
ships as `third-party/texts/OFL-1.1.txt`, which also reproduces the upstream
copyright statements, and the original upstream OFL files are kept alongside the
fonts as `src/assets/fonts/SourceSerif4-OFL.txt` and
`src/assets/fonts/SourceHanSerifSC-OFL.txt`.

## Source Serif 4 — format conversion only

- Upstream project: <https://github.com/adobe-fonts/source-serif>
- Upstream release: `4.005R`
- Upstream archive: `source-serif-4.005_Desktop.zip`
  (sha256 `549fdb8f9a682bd06944298621404969f6de77c2e422ff3b8244a1dcd6a0c425`, 17,634,695 bytes,
  from <https://github.com/adobe-fonts/source-serif/releases/download/4.005R/source-serif-4.005_Desktop.zip>)
- Copyright: `Copyright 2014 - 2023 Adobe (http://www.adobe.com/), with Reserved
  Font Name 'Source'.` Reserved font name: **Source**.

### Files

| Bundled file | Upstream TTF | Upstream sha256 | Bundled sha256 |
| --- | --- | --- | --- |
| `SourceSerif4-Regular.ttf.woff2` | `TTF/SourceSerif4-Regular.ttf` | `e5a4ee6a3d87bb9024796be390c6771e2a0eb1883dae25effaf57ca01668e24b` | `6b053e98f0838afe81f3e784727be4583a7c13bb42f198dc5202ecffee0aaee0` |
| `SourceSerif4SmText-It.ttf.woff2` | `TTF/SourceSerif4SmText-It.ttf` | `74963111a9dc458611e6eaa62a6bff8811855f67e015f91b728fb52567020c5e` | `a47b231d781d93e8c3f227d3d766b12bc99ec430c409492396ab0090f29bacf8` |
| `SourceSerif4-Bold.ttf.woff2` | `TTF/SourceSerif4-Bold.ttf` | `7cf4f4e1ad74f45058d5bc61716b82560442fbdcd9d3654d2dea96bf6c683d86` | `6d4fd4c0f08798a478fe34aafea9bf5cfa1cbc6ae4b834193febaee74254d10c` |
| `SourceSerif4-BoldIt.ttf.woff2` | `TTF/SourceSerif4-BoldIt.ttf` | `7b215b37f8873f5579f3f8d2ded3ca7c588e2f435cd996605ebfc5befe2cd5eb` | `738ded930ea75d50331c43390217282f212419e8bf0d42932771de8047c8e404` |

### Why the reserved font name is kept

The bundled files are plain WOFF2 compressions of the upstream TTFs. Table-by-table
comparison against the 4.005R desktop TTFs shows the only differences are:

- the `DSIG` table is dropped (WOFF2 does not carry it), and
- `head.checkSumAdjustment` and `head.flags` are recomputed, as the format requires.

Every other table — including `name`, `cmap`, `glyf`, `loca`, `hmtx`, `GSUB`,
`GPOS` — is byte-identical to upstream. Per the OFL-FAQ (entries 2.2.1 and 2.2.2)
a WOFF2 conversion that only compresses unchanged data and preserves the original
metadata is **not** a Modified Version, so the reserved font name `Source` may
continue to be used.

## Source Han Serif SC — subsetted and renamed

- Upstream project: <https://github.com/adobe-fonts/source-han-serif>
- Upstream release: `2.003R`
- Upstream archive: `09_SourceHanSerifSC.zip`
  (sha256 `8f633642eedf9bf23ab3336faa3d03ce1b56c14d654cd25752bc829c05f79f0d`, 138,632,153 bytes,
  from <https://github.com/adobe-fonts/source-han-serif/releases/download/2.003R/09_SourceHanSerifSC.zip>)
- Copyright: `© 2017-2024 Adobe (http://www.adobe.com/), with Reserved Font Name
  'Source'.` Reserved font name: **Source**.

### Files

| Bundled file | Upstream OTF | Upstream sha256 | Bundled sha256 |
| --- | --- | --- | --- |
| `SourceHanSerifSC-Regular-common.woff2` | `OTF/SimplifiedChinese/SourceHanSerifSC-Regular.otf` | `78aa7a328fd974df2d688c8a9fd74a33d8334dfa84ab24d9d11efb2ffc464117` | `6ac6d43f27fc24efc32b46b3ab81afad79a7fd70c95004137760ec4dac9fd6ab` |
| `SourceHanSerifSC-Bold-common.woff2` | `OTF/SimplifiedChinese/SourceHanSerifSC-Bold.otf` | `706b8c0de2deff6cbc0c87e2cdedfd33a78b7ffd76cebb4549012f197ba611fe` | `f3478c012244e5a4107327326cb4c80745d81e26bcf8a565e15f2f39aab4b4ea` |

Superseded builds (kept for rollback reference):

| Superseded file | sha256 |
| --- | --- |
| `SourceHanSerifSC-Regular-common.woff2` (pre-rename) | `647d8e18340aee8e1c51412a9d30123a937da3a5e8c5df90699f955e5ee3ad1d` |
| `SourceHanSerifSC-Bold-common.woff2` (pre-rename) | `694944f0a534f7dba651c763fd35a8488f81af464bb49c6abf26b4c06012dd47` |

### Subsetting parameters

Regenerated with `scripts/regenerate-cjk-font-subset.py`, which runs
`python3 -m fontTools.subset` with:

```
--unicodes=<the codepoint inventory of the previous build>
--flavor=woff2
--layout-features=*          # keep all shaping features
--glyph-names
--notdef-outline
--recommended-glyphs
--name-IDs=* --name-languages=*
--drop-tables+=DSIG
```

Coverage is **not** recomputed from GB2312 on each run: the script reads the
codepoint set out of the existing subset, so regenerating cannot silently add or
drop characters.

- Codepoints: 4,193 (ASCII 0x20–0x7E, CJK punctuation 0x3000–0x303E, fullwidth
  forms 0xFF01–0xFF60, mathematical/arrow/dingbat blocks, plus the 3,755
  GB2312 Level 1 hanzi).
- Glyphs: 7,616 (the previous build had 7,322; the difference is the additional
  `.notdef`-adjacent and recommended glyphs `pyftsubset` now retains).
- Size: Regular 1,852,184 B, Bold 1,946,852 B — combined 3,799,036 B, within the
  4 MB `bundle-budget` limit.

### Why the reserved font name is dropped

Subsetting removes glyphs and smart-font coverage. The OFL-FAQ is explicit that
this is a Modified Version (entry 2.6) and that a reserved font name must not be
reused for a Modified Version (entries 5.2–5.4). The reserved name here is
`Source`, so the bundled family is renamed to **`MarkFlow Serif SC`**:

- `name` IDs 1, 2, 3, 4 and 6 are rewritten (family, subfamily, unique id, full
  name, PostScript name) on both the Windows and Macintosh platforms.
- `name` ID 0 (copyright) is **preserved verbatim**, as the OFL requires.
- `name` IDs 7–11 and 13–14 (trademark, manufacturer, designers, license
  description and URL) are preserved.
- `name` ID 10 gains a note stating this is a GB2312 Level 1 subset distributed
  by MarkFlow and not the upstream font.

The upstream name stays available only as a *system* fallback in the CSS stack
(`--font-serif`), where the browser is looking for a locally installed font and
is not redistributing anything.

Glyph outlines and advance widths are verified to be identical to upstream across
all 4,193 codepoints by `scripts/regenerate-cjk-font-subset.py --verify-only`, so
this is a coverage reduction, not a redesign.

## Consuming code

Changing the family name touches exactly these places; the OpenSpec
`font-stack` spec pins them:

- `src/styles/variables.css` — `@font-face` declarations and `--font-serif`
- `src/export/theme/fonts.ts` — inlined `@font-face` for self-contained HTML export
- `src/export/theme/base.ts` — export theme `bodyFont` and `fonts.eastAsia`
