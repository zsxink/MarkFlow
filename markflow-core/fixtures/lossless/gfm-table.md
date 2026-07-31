# GFM Table Fixture

## Alignment preservation

| Left | Center | Right | Default |
| :--- | :----: | ----: | ------- |
| a    |   b    |    c  | d       |
| aa   |   bb   |   cc  | dd      |

## Escaped pipe

| Name | Value |
| ---- | ----- |
| pipe | a \| b |
| backslash | a \\ b |

## Empty cells

| a | b | c |
| --- | --- | --- |
| x |  | z |
|  | y |  |

## Multi-line paragraph inside cell

| col |
| --- |
| a single cell with
  a wrapped continuation line |

## Table without alignment row

| simple | table |
| --- | --- |
| 1 | 2 |
