import { writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Isolated source documents consumed by p4b-cohort-reveal.e2e.mjs.
 * Keep the marker-bearing constructs at stable offsets so the desktop suite
 * exercises the same source coordinates as the P4B contract.
 */
export const P4B_COHORT_FIXTURES = Object.freeze({
  'p4b-cohort-heading.md': '# Heading text\n\nplain paragraph\n',
  'p4b-cohort-emoji.md': '**加粗🚀**\n',
  'p4b-cohort-link.md': '[text](https://example.com)\n',
  'p4b-cohort-quote.md': '> Quote text\n\nplain paragraph\n',
  'p4b-cohort-fence.md': '```js\nconst x = 1;\n```\n',
});

export async function writeP4bCohortFixtures(workspace) {
  await Promise.all(Object.entries(P4B_COHORT_FIXTURES).map(([name, content]) =>
    writeFile(path.join(workspace, name), content),
  ));
}
