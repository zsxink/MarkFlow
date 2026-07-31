---
title: "A MarkFlow FrontMatter Fixture"
author:
  name: 测试作者
  email: author@example.com
date: 2026-07-31
tags:
  - markdown
  - 中文标签
draft: false
nested:
  key: value
  list: [one, two, three]
---

# FrontMatter Body

The YAML block above must round-trip byte-for-byte: comments, quotes, ordering,
indentation and EOL style are preserved.

<!-- a comment inside the body -->

Body paragraph with **formatting**.
