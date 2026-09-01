/**
 * Fixed Markdown corpus for the WYSIWYG migration baseline.
 *
 * Keep fixture text deliberately small and reviewable.  This file is the
 * source of truth for the stage-one baseline test and benchmark; do not add
 * expected v3 output here.
 */
export type FixtureCategory =
  | 'heading'
  | 'inline'
  | 'link'
  | 'image'
  | 'break'
  | 'nested-list'
  | 'task-list'
  | 'table'
  | 'code-block'
  | 'mermaid'
  | 'plantuml'
  | 'trailing-newline'
  | 'invalid';

export type MarkdownFixture = {
  id: string;
  category: FixtureCategory;
  boundary: 'normal' | 'edge';
  markdown: string;
  /** Known v2 behavior, not an assertion about the future v3 adapter. */
  knownV2Differences: string[];
};

export const WYSIWYG_ROUNDTRIP_FIXTURES: readonly MarkdownFixture[] = [
  { id: 'heading-basic', category: 'heading', boundary: 'normal', markdown: '# Release notes\n\nA paragraph.', knownV2Differences: [] },
  { id: 'heading-edge-depth', category: 'heading', boundary: 'edge', markdown: '###### Deep heading\n\nText after.', knownV2Differences: [] },
  { id: 'inline-basic', category: 'inline', boundary: 'normal', markdown: '**bold** and *emphasis* with ~~strike~~ and `code`.', knownV2Differences: [] },
  { id: 'inline-nested', category: 'inline', boundary: 'edge', markdown: '***bold emphasis*** and **`inline code`**.', knownV2Differences: [] },
  { id: 'link-basic', category: 'link', boundary: 'normal', markdown: '[MarkFlow](https://markflow.example/docs "Docs")', knownV2Differences: [] },
  { id: 'link-escaped-target', category: 'link', boundary: 'edge', markdown: '[query](https://example.test/a_(b)?x=1&y="two")', knownV2Differences: ['v2 custom link serializer escapes parentheses and quotes'] },
  { id: 'image-basic', category: 'image', boundary: 'normal', markdown: '![diagram](images/diagram.png "Architecture")', knownV2Differences: [] },
  { id: 'image-remote', category: 'image', boundary: 'edge', markdown: '![remote](https://cdn.example/diagram.svg "Remote")', knownV2Differences: [] },
  { id: 'break-soft', category: 'break', boundary: 'normal', markdown: 'line one\nline two', knownV2Differences: ['v2 parser uses CommonMark soft-break semantics; serializer formatting is implementation-defined'] },
  { id: 'break-hard', category: 'break', boundary: 'edge', markdown: 'line one  \nline two\n\nnext paragraph', knownV2Differences: [] },
  { id: 'nested-list-basic', category: 'nested-list', boundary: 'normal', markdown: '- parent\n  - child\n    1. grandchild\n- sibling', knownV2Differences: [] },
  { id: 'nested-list-continuation', category: 'nested-list', boundary: 'edge', markdown: '1. first item\n   continued text\n2. second item', knownV2Differences: ['v2 list serialization may normalize indentation and ordered markers'] },
  { id: 'task-list-basic', category: 'task-list', boundary: 'normal', markdown: '- [ ] todo\n- [x] done', knownV2Differences: [] },
  { id: 'task-list-nested', category: 'task-list', boundary: 'edge', markdown: '- [x] parent\n  - [ ] nested todo\n  - [x] nested done', knownV2Differences: [] },
  { id: 'table-basic', category: 'table', boundary: 'normal', markdown: '| Name | Status |\n| --- | --- |\n| Alpha | **ready** |\n| Beta | pending |', knownV2Differences: [] },
  { id: 'table-empty-escaped', category: 'table', boundary: 'edge', markdown: '| A | B | C |\n| :--- | ---: | :---: |\n|  | a \\| b |  |', knownV2Differences: ['v2 table serializer may normalize alignment markers and escaped pipes'] },
  { id: 'code-basic', category: 'code-block', boundary: 'normal', markdown: '```ts\nconst answer = 42;\n```', knownV2Differences: [] },
  { id: 'code-trailing-lines', category: 'code-block', boundary: 'edge', markdown: '```text\nline\n\n```', knownV2Differences: ['v2 custom code-block serializer preserves authored trailing code newlines'] },
  { id: 'mermaid-basic', category: 'mermaid', boundary: 'normal', markdown: '```mermaid\ngraph TD\n  A --> B\n```', knownV2Differences: [] },
  { id: 'mermaid-empty', category: 'mermaid', boundary: 'edge', markdown: '```mermaid\n\n```', knownV2Differences: ['v2 node view may render an empty/invalid diagram while persistence remains code text'] },
  { id: 'plantuml-basic', category: 'plantuml', boundary: 'normal', markdown: '```plantuml\n@startuml\nAlice -> Bob: hello\n@enduml\n```', knownV2Differences: [] },
  { id: 'plantuml-unconfigured', category: 'plantuml', boundary: 'edge', markdown: '```plantuml\n@startuml\nAlice -> Bob\n@enduml\n```', knownV2Differences: ['v2 node view requires a configured PlantUML server for preview; source persistence is independent'] },
  { id: 'trailing-none', category: 'trailing-newline', boundary: 'normal', markdown: '# No final newline', knownV2Differences: [] },
  { id: 'trailing-multiple', category: 'trailing-newline', boundary: 'edge', markdown: '# Two final newlines\n\n\n', knownV2Differences: ['v2 metadata restores trailing newlines after ProseMirror serialization'] },
  { id: 'invalid-unclosed-fence', category: 'invalid', boundary: 'normal', markdown: '```js\nconst unfinished = true;', knownV2Differences: ['v2 markdown parser treats an unclosed fence as code until end of input'] },
  { id: 'invalid-table-width', category: 'invalid', boundary: 'edge', markdown: '| A | B |\n| --- |\n| only one cell |', knownV2Differences: ['v2 GFM parser applies its own table recovery rules for malformed delimiter rows'] },
];

export const FIXTURE_CATEGORIES: readonly FixtureCategory[] = [
  'heading', 'inline', 'link', 'image', 'break', 'nested-list', 'task-list',
  'table', 'code-block', 'mermaid', 'plantuml', 'trailing-newline', 'invalid',
];
