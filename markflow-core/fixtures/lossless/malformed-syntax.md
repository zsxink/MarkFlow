# Malformed Syntax Fixture

## Unclosed code fence

````markdown
this fence is never closed

````
## Bad table (fewer cells than header)

| header a | header b |
| --- | --- |
| only one cell
| three | cells | here |

## Unclosed emphasis delimiter

This is **bold without closing.

And this is *emphasis also unclosed.

## Heading without space

#Not a heading per CommonMark? Actually this is text.

## Stray fence characters

~~~

three tildes unclosed

## Stray list continuation

- item one

this line is a lazy continuation, no marker.

## Empty reference

[missing][]

## Mis-nested emphasis

**strong *bold and italic**

## Bad link destination

[link](https://example.com/space here)
