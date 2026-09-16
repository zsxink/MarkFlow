## ADDED Requirements

### Requirement: Source mode highlights frontmatter as YAML
The source editor SHALL apply YAML syntax highlighting to the complete document-leading frontmatter block while retaining Markdown highlighting for the remaining document. Source-mode edits and mode switches SHALL continue to use the complete persisted Markdown representation.

#### Scenario: Source document contains frontmatter and Markdown body
- **WHEN** the user opens a document with a complete leading frontmatter block in source mode
- **THEN** the frontmatter block is highlighted as YAML
- **THEN** the document body is highlighted as Markdown

#### Scenario: Source mode is entered after a frontmatter edit
- **WHEN** a user switches to source mode after editing frontmatter through the visual editor
- **THEN** the source editor contains the complete updated Markdown document including the updated YAML frontmatter
- **THEN** the mode switch does not create a false dirty state
