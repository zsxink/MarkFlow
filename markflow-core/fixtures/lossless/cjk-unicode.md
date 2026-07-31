# CJK 与 Unicode 测试

## 中文段落

这是一段中文，包含标点：、。！？「」『』（）——以及全角空格　和半角空格。

## 日文段落

これは日本語のテストです。ひらがな・カタカナ・漢字を含みます。『括弧』と「引用」。

## 韩文段落

이것은 한국어 테스트입니다. 한글 문장과 조사 그리고 부호를 포함합니다.

## Emoji and surrogate pairs

Emoji: 😀 🎉 🚀 👨‍👩‍👧‍👦 (family is a ZWJ sequence of multiple surrogate pairs).

Astral plane: 𠀀 U+20000, 𠮷 U+20BB7.

## Combining marks

cafe without accent + combining acute: café

## RTL text

العربية مرحبا بالعالم
עברית שלום עולם

## Mixed CJK inline with Markdown

**加粗中文** 和 *斜体中文* 与 `行内代码中文`，以及 [中文链接](https://example.com/中文路径)。

| 列A | 列B |
| --- | --- |
| 值一 | 值二 |
| 值三 | 值四 |
