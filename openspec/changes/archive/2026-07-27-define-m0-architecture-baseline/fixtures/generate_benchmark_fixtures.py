#!/usr/bin/env python3
"""Generate M0 fixture data with intentional BOM and EOL bytes."""

from __future__ import annotations

import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SMALL = ROOT / "small"
GENERATED = ROOT / "generated"


SMALL_FIXTURES: dict[str, bytes] = {
    "lf-basic.md": (
        "# LF Basic\n\n"
        "Paragraph with [a link](https://example.test).\n\n"
        "- item one\n"
        "- item two\n"
    ).encode(),
    "crlf-basic.md": (
        "# CRLF Basic\r\n\r\n"
        "Paragraph with CRLF endings.\r\n"
        "- item one\r\n"
        "- item two\r\n"
    ).encode(),
    "mixed-eol.md": (
        b"# Mixed EOL\r\n"
        b"line with crlf\r\n"
        b"line with lf\n"
        b"line with cr\rover\n"
    ),
    "utf8-bom.md": b"\xef\xbb\xbf# BOM\n\n"
    + "UTF-8 BOM should survive save reconstruction.\n".encode(),
    "unicode-offsets.md": (
        "# Unicode Offsets\n\n"
        "中文 emoji 😀 musical 𝄞 combining e\u0301 plain.\n"
        "Cursor math must distinguish bytes from UTF-16 code units.\n"
    ).encode(),
    "trailing-newlines.md": b"# Trailing\n\nBody keeps three final newlines.\n\n\n",
    "frontmatter-lossless.md": (
        "---\n"
        "# frontmatter comment\n"
        "title: \"Quoted Title\"\n"
        "tags:\n"
        "  - alpha\n"
        "  - beta\n"
        "nested:\n"
        "  enabled: true\n"
        "\n"
        "summary: |\n"
        "  line one\n"
        "  line two\n"
        "---\n\n"
        "# Body\n\n"
        "FrontMatter body.\n"
    ).encode(),
    "html-comments.md": (
        "# HTML\n\n"
        "<!-- keep this comment -->\n\n"
        "<div data-kind=\"raw\">\n"
        "  <span>Raw HTML block</span>\n"
        "</div>\n"
    ).encode(),
    "list-markers.md": (
        "# Lists\n\n"
        "- dash\n"
        "* star\n"
        "+ plus\n\n"
        "1. dotted\n"
        "2) paren\n"
        "4. preserved start\n"
    ).encode(),
    "fence-styles.md": (
        "# Fences\n\n"
        "```rust\n"
        "fn main() {}\n"
        "```\n\n"
        "~~~~markdown\n"
        "``` nested fence text\n"
        "~~~~\n"
    ).encode(),
    "gfm-table.md": (
        "# GFM\n\n"
        "| left | center | right |\n"
        "| :--- | :----: | ----: |\n"
        "| a    | b      | c     |\n\n"
        "- [x] done\n"
        "- [ ] todo\n"
    ).encode(),
    "malformed-recovery.md": (
        "# Malformed\n\n"
        "```js\n"
        "console.log('missing closing fence')\n\n"
        "- list continues after malformed block\n"
    ).encode(),
}


BENCH_TARGETS = {
    "bench-1mb.md": 1 * 1024 * 1024,
    "bench-10mb.md": 10 * 1024 * 1024,
    "bench-50mb.md": 50 * 1024 * 1024,
}


def write_small() -> None:
    SMALL.mkdir(parents=True, exist_ok=True)
    for name, data in SMALL_FIXTURES.items():
        (SMALL / name).write_bytes(data)


def write_bench() -> None:
    GENERATED.mkdir(parents=True, exist_ok=True)
    unit = (
        "# Benchmark Section\n\n"
        "Paragraph with Markdown **strong**, _emphasis_, `code`, 中文, and 😀.\n\n"
        "- item alpha\n"
        "- item beta\n"
        "- [x] task\n\n"
        "| name | value |\n"
        "| --- | ---: |\n"
        "| alpha | 100 |\n\n"
        "```rust\n"
        "fn generated_fixture() { println!(\"bench\"); }\n"
        "```\n\n"
    ).encode()
    for name, size in BENCH_TARGETS.items():
        path = GENERATED / name
        with path.open("wb") as fh:
            while fh.tell() < size:
                fh.write(unit)
            fh.truncate(size)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--small", action="store_true", help="generate small fixtures")
    parser.add_argument("--bench", action="store_true", help="generate large benchmark fixtures")
    args = parser.parse_args()
    if not args.small and not args.bench:
        args.small = True
    if args.small:
        write_small()
    if args.bench:
        write_bench()


if __name__ == "__main__":
    main()
