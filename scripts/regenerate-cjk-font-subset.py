#!/usr/bin/env python3
"""Regenerate the bundled CJK font subset with a license-compliant family name.

Why this script exists
----------------------
MarkFlow ships a GB2312 Level 1 subset of Source Han Serif SC. Subsetting removes
glyphs, which the OFL-FAQ (entries 2.6 and 5.4) treats as creating a Modified
Version: the reserved font name "Source" must not be reused for it. So the subset
is redistributed under the family name "MarkFlow Serif SC" while keeping Adobe's
copyright notice and the OFL metadata intact.

The codepoint inventory is taken from the *existing* subset rather than
recomputed from GB2312, so regenerating cannot silently change which characters
ship. Only the `name` table differs from the previous build.

Not part of CI
--------------
This needs `fonttools` and the 162MB upstream OTF, neither of which belongs in a
CI runner. Run it by hand when the subset has to change; commit the resulting
woff2 plus the checksums recorded in `third-party/fonts/PROVENANCE.md`.

Usage:
    python3 scripts/regenerate-cjk-font-subset.py \
        --upstream-dir /path/to/09_SourceHanSerifSC/OTF/SimplifiedChinese

    # Verify an existing build instead of regenerating:
    python3 scripts/regenerate-cjk-font-subset.py --verify-only \
        --upstream-dir /path/to/09_SourceHanSerifSC/OTF/SimplifiedChinese
"""

from __future__ import annotations

import argparse
import hashlib
import io
import subprocess
import sys
import tempfile
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.ttLib.woff2 import compress, decompress

REPO = Path(__file__).resolve().parent.parent
FONT_DIR = REPO / "src" / "assets" / "fonts"

# Upstream weight file -> (bundled file, weight name, internal PostScript name)
TARGETS = {
    "Regular": {
        "upstream": "SourceHanSerifSC-Regular.otf",
        "bundled": "SourceHanSerifSC-Regular-common.woff2",
        "family": "MarkFlow Serif SC",
        "subfamily": "Regular",
        "postscript": "MarkFlowSerifSC-Regular",
    },
    "Bold": {
        "upstream": "SourceHanSerifSC-Bold.otf",
        "bundled": "SourceHanSerifSC-Bold-common.woff2",
        "family": "MarkFlow Serif SC",
        "subfamily": "Bold",
        "postscript": "MarkFlowSerifSC-Bold",
    },
}

# nameID -> what it holds. 0 (copyright) and 13/14 (license) are never rewritten.
NAME_IDS_TO_REPLACE = {
    1: "family",       # Font Family
    2: "subfamily",    # Font Subfamily
    3: "unique",       # Unique identifier
    4: "full",         # Full font name
    6: "postscript",   # PostScript name
}

SUBSET_NOTE = (
    "MarkFlow Serif SC is a GB2312 Level 1 subset of Source Han Serif SC 2.003R "
    "distributed by MarkFlow. Subsetting makes this a Modified Version under the "
    "SIL Open Font License 1.1, so the upstream reserved font name 'Source' is not "
    "used. Glyph outlines and metrics are unchanged from upstream; only glyph "
    "coverage and the name table differ."
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def codepoints_of(path: Path) -> list[int]:
    return sorted(TTFont(str(path)).getBestCmap())


def format_unicodes(codepoints: list[int]) -> str:
    ranges: list[tuple[int, int]] = []
    start = prev = None
    for cp in codepoints:
        if start is None:
            start = prev = cp
            continue
        if cp == prev + 1:
            prev = cp
            continue
        ranges.append((start, prev))
        start = prev = cp
    if start is not None:
        ranges.append((start, prev))
    return ",".join(
        f"U+{a:04X}" if a == b else f"U+{a:04X}-{b:04X}" for a, b in ranges
    )


def run_subset(upstream: Path, unicodes: str, out_path: Path) -> None:
    """pyftsubset with flags that keep the result a pure glyph-coverage reduction.

    `--layout-features=*` and `--glyph-names` keep shaping identical to upstream;
    `--no-hinting` would drop hinting, so it is deliberately absent.
    """
    args = [
        sys.executable,
        "-m",
        "fontTools.subset",
        str(upstream),
        f"--unicodes={unicodes}",
        "--output-file=" + str(out_path),
        "--flavor=woff2",
        "--layout-features=*",
        "--glyph-names",
        "--notdef-outline",
        "--recommended-glyphs",
        "--name-IDs=*",
        "--name-languages=*",
        "--drop-tables+=DSIG",
    ]
    subprocess.run(args, check=True)


def rewrite_names(path: Path, target: dict, upstream: Path) -> None:
    """Replace the identifying name records; keep copyright and license records."""
    font = TTFont(str(path))
    upstream_font = TTFont(str(upstream))
    upstream_names = {
        (rec.nameID, rec.platformID, rec.platEncID, rec.langID): rec.toUnicode()
        for rec in upstream_font["name"].names
    }

    version = next(
        (
            upstream_names[key]
            for key in upstream_names
            if key[0] == 5
        ),
        "Version 2.003",
    )
    # Upstream version strings look like "Version 2.003;hotconv 1.1.1;makeotfexe 2.6.0";
    # keep the numeric part for the unique id so it stays traceable to upstream.
    numeric_version = version.replace("Version ", "").split(";")[0]

    replacements = {
        "family": target["family"],
        "subfamily": target["subfamily"],
        "full": target["family"] if target["subfamily"] == "Regular"
        else f"{target['family']} {target['subfamily']}",
        "postscript": target["postscript"],
        "unique": f"{numeric_version};MARKFLOW;{target['postscript']};MARKFLOW",
    }

    name_table = font["name"]
    # Rebuild every identifying record, including the macintosh (platform 1)
    # copies, so no platform still advertises the upstream name.
    new_records = []
    for rec in name_table.names:
        key = NAME_IDS_TO_REPLACE.get(rec.nameID)
        if key is None:
            new_records.append(rec)
            continue
        value = replacements[key]
        if rec.platformID == 1:  # Macintosh Roman, ASCII-only
            rec.string = value.encode("ascii", "replace")
        else:
            rec.string = value.encode("utf-16-be")
        new_records.append(rec)
    name_table.names = new_records

    # A dedicated record explaining that this is a subset, not the upstream font.
    # nameID 10 (description) is a free-text slot, so it does not disturb the
    # family/subfamily resolution browsers use.
    name_table.setName(SUBSET_NOTE, 10, 3, 1, 0x409)
    name_table.setName(SUBSET_NOTE, 10, 1, 0, 0)

    # Keep the OFL-required license metadata present even though pyftsubset kept
    # it: some upstream name records use ids 13/14 that subsetting may have
    # dropped along with their language tags.
    license_text = (
        "This Font Software is licensed under the SIL Open Font License, "
        "Version 1.1. This license is available with a FAQ at: "
        "https://openfontlicense.org"
    )
    if not any(rec.nameID == 13 for rec in name_table.names):
        name_table.setName(license_text, 13, 3, 1, 0x409)
    if not any(rec.nameID == 14 for rec in name_table.names):
        name_table.setName("https://openfontlicense.org", 14, 3, 1, 0x409)

    font.flavor = "woff2"
    font.save(str(path))


def verify(upstream: Path, bundled: Path, expected_codepoints: list[int]) -> list[str]:
    """Assert the bundled file is a pure coverage reduction of upstream."""
    problems = []
    sub = TTFont(str(bundled))
    orig = TTFont(str(upstream))

    sub_cps = sorted(sub.getBestCmap())
    if sub_cps != expected_codepoints:
        problems.append(
            f"{bundled.name}: codepoint inventory drifted "
            f"({len(sub_cps)} vs expected {len(expected_codepoints)})"
        )

    orig_cmap = orig.getBestCmap()
    missing = [cp for cp in sub_cps if cp not in orig_cmap]
    if missing:
        problems.append(
            f"{bundled.name}: {len(missing)} codepoints are absent from upstream"
        )

    # Geometry must be untouched: subsetting may drop glyphs but must not
    # redraw them, otherwise this is a derivative design and not just a subset.
    from fontTools.pens.boundsPen import BoundsPen

    orig_glyphs = orig.getGlyphSet()
    sub_glyphs = sub.getGlyphSet()
    mismatched = 0
    for cp in sub_cps:
        orig_name = orig_cmap[cp]
        sub_name = sub.getBestCmap()[cp]
        orig_pen, sub_pen = BoundsPen(orig_glyphs), BoundsPen(sub_glyphs)
        orig_glyphs[orig_name].draw(orig_pen)
        sub_glyphs[sub_name].draw(sub_pen)
        if orig_pen.bounds != sub_pen.bounds or orig["hmtx"][orig_name] != sub["hmtx"][sub_name]:
            mismatched += 1
    if mismatched:
        problems.append(
            f"{bundled.name}: {mismatched}/{len(sub_cps)} glyphs differ in outline or advance from upstream"
        )

    names = {rec.nameID: rec.toUnicode() for rec in sub["name"].names if rec.platformID == 3}
    for name_id, label in ((1, "family"), (4, "full name"), (6, "PostScript name")):
        value = names.get(name_id, "")
        if "Source" in value:
            problems.append(
                f"{bundled.name}: {label} still contains the reserved font name 'Source' ({value!r})"
            )
    if "Copyright" not in names.get(0, "") and "©" not in names.get(0, ""):
        problems.append(f"{bundled.name}: copyright record (nameID 0) was dropped")

    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--upstream-dir",
        required=True,
        type=Path,
        help="Directory containing SourceHanSerifSC-{Regular,Bold}.otf from the 2.003R release",
    )
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="Do not rebuild; only assert the committed files match the recorded contract",
    )
    args = parser.parse_args()

    problems: list[str] = []

    for weight, target in TARGETS.items():
        upstream = args.upstream_dir / target["upstream"]
        bundled = FONT_DIR / target["bundled"]
        if not upstream.exists():
            print(f"skip {weight}: upstream OTF not found at {upstream}")
            continue

        # The committed subset defines which characters must keep shipping.
        expected = codepoints_of(bundled) if bundled.exists() else []

        if not args.verify_only:
            print(f"[{weight}] upstream sha256 {sha256(upstream)}")
            with tempfile.TemporaryDirectory() as tmp:
                staged = Path(tmp) / target["bundled"]
                run_subset(upstream, format_unicodes(expected), staged)
                rewrite_names(staged, target, upstream)
                # Verify before overwriting the committed file.
                problems.extend(verify(upstream, staged, expected))
                if problems:
                    print("refusing to overwrite; staged build failed verification")
                    return 1
                bundled.write_bytes(staged.read_bytes())

        print(f"[{weight}] bundled sha256 {sha256(bundled)}")
        problems.extend(verify(upstream, bundled, expected))

    if problems:
        print("\nFONT VERIFICATION FAILED")
        for problem in problems:
            print(f"  - {problem}")
        return 1

    print("\nFont verification OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
