# MarkFlow English Example

This is a sample Markdown document for testing **MarkFlow**.

![MarkFlow Wordmark](../assets/markflow-wordmark.png)

## Basic Formatting

- Unordered list item
- Supports **bold**, *italic*, and ~~strikethrough~~
- Supports `inline code`

1. First ordered item
2. Second ordered item
3. Third ordered item

> This is a blockquote.
>
> It can be used to verify block-level quote styling.

---

## Task List

- [x] Core Markdown editor implemented

- [x] Image support added

- [x] Mermaid rendering enabled

- [ ] Add more example documents

## Table

| Feature | Status | Notes |
| --- | --- | --- |
| WYSIWYG editing | Done | Main editing experience |
| Source mode | Done | Direct Markdown editing |
| Mermaid diagrams | Done | Render in preview, save raw source |

### Table Example

| Module | Priority | Owner | Notes |
| --- | --- | --- | --- |
| Editor | High | Ryan | Main development area |
| File Tree | Medium | MarkFlow | Supports drag and rename |
| Mermaid | High | Claude | Preview rendering and source editing |
| Example Docs | Low | Docs | Used to demonstrate features |

## Code Block

```ts
function greet(name: string) {
  return `Hello, ${name}`;
}

console.log(greet('MarkFlow'));
```

## Mermaid Example

```mermaid
graph TD
  A[Open document] --> B[Edit Markdown]
  B --> C{Insert Mermaid?}
  C -->|Yes| D[Render diagram]
  C -->|No| E[Keep editing]
  D --> F[Save source]
  E --> F
```

## Second Mermaid Example

```mermaid
sequenceDiagram
  participant U as User
  participant E as Editor
  participant S as Storage

  U->>E: Enter Mermaid source
  U->>E: Click diagram to edit
  E->>E: Toggle current block into inline source editing
  U->>E: Update and apply changes
  E->>S: Save raw Markdown source
```

## PlantUML Example

```plantuml
@startuml
Alice -> Bob: Authentication Request
Bob --> Alice: Authentication Response

Alice -> Bob: Another request
Bob --> Alice: Another response
@enduml
```

```plantuml
@startuml
start
:User opens document;
if (Has PlantUML?) then (yes)
  :Render diagram;
else (no)
  :Show code block;
endif
stop
@enduml
```

## Links

You can create [inline links](https://example.com) and [links with titles](https://example.com).

Bare URLs like https://example.com are automatically detected and decorated. Ctrl+Click or Cmd+Click to open them directly.

## Images

In addition to the logo above, MarkFlow supports inline images anywhere in your document:

![MarkFlow Logo](../assets/markflow-wordmark.png)

## Ending

Thanks for using MarkFlow.