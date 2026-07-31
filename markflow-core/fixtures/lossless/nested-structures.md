# Nested Structures

## Blockquote containing a list containing a blockquote

> Outer quote line.
> - list item one
> - list item two
>   > nested quote inside a list item
>   >
>   > with its own paragraph
> - list item three

## List with nested list and code block

1. first
   1. nested ordered
   2. another
2. second
   - bullet inside ordered
   - another bullet

```text
code block inside an item:

    still indented
```

## Nested inline emphasis

This is **bold with `code` and *italic* and ~~strike~~ inside**.

## Blockquote with nested fenced code

> quote
>
> ```rust
> fn main() { println!("hi"); }
> ```
>
> end quote

## List with a nested paragraph continuation

- item

  continuation paragraph indented four spaces

  - deeper item

## Deeply nested mixed structure

> - level 1
>   - level 2
>     - level 3
>       - level 4
