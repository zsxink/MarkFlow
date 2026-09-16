# Simple-array preservation spike

The `frontmatter.test.ts` fixture exercises the evidence gate used by the visual
editor: flow and block scalar arrays are accepted only when their items are
comment-free, homogeneous, non-null scalars. The parser uses JavaScript string
offsets consistently (including Unicode), preserves LF/CRLF source ranges, and
keeps quoted scalar values typed as text. Add/remove/reorder are field-local
operations; mixed, nested, null, tagged/anchored, or commented arrays return a
source-only analysis rather than a rewrite. Array controls are exposed only when
`analyzeFrontmatter(...).supported` succeeds.
