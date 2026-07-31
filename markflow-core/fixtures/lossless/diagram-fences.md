# Diagram Fixture

## Mermaid flowchart

```mermaid
flowchart TD
    A[Start] --> B{Is it?}
    B -->|Yes| C[OK]
    B -->|No| D[Retry]
    C --> E[End]
    D --> B
```

## Mermaid sequence

```mermaid
sequenceDiagram
    participant U as User
    participant E as Editor
    U->>E: type text
    E->>E: patch
    E-->>U: ack
```

## PlantUML class

```plantuml
@startuml
class Editor {
  +insertText(text)
  +deleteRange(range)
}
@enduml
```

## Mermaid gantt

```mermaid
gantt
    title A Gantt Diagram
    dateFormat YYYY-MM-DD
    section Planning
    Spec writing      :done, a1, 2026-07-01, 7d
    Implementation    :active, a2, 2026-07-08, 14d
```

## Fenced code that is NOT a diagram

```text
This fence has an unknown info string, not a diagram.
```
