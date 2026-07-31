# Image Fixture

## Inline image with alt and title

![MarkFlow logo](assets/logo.png "Project logo")

## Relative image paths

![relative](images/photo.png)

![nested](../images/../images/photo.png)

## Image reference definitions

![referenced image][ref-image]

[ref-image]: assets/reference.png "Reference alt"

## Broken and unsafe images

![broken](missing/not-found.png)

![unsafe](javascript:alert(1))

![data](data:image/png;base64,iVBORw0KGgo=)

## Image with escaped brackets in alt

![alt with \[bracket\]](assets/escaped.png)

## Image inside a link

[![clickable image](assets/thumb.png)](https://example.com/full)

## Image in a list

- item with ![small](assets/small.png) inline
- another item
