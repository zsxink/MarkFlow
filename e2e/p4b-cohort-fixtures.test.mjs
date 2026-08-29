import assert from 'node:assert/strict';
import test from 'node:test';
import { P4B_COHORT_FIXTURES } from './p4b-cohort-fixtures.mjs';

test('P4B cohort fixtures match the desktop suite contract', () => {
  assert.deepEqual(Object.keys(P4B_COHORT_FIXTURES), [
    'p4b-cohort-heading.md',
    'p4b-cohort-emoji.md',
    'p4b-cohort-link.md',
    'p4b-cohort-quote.md',
    'p4b-cohort-fence.md',
  ]);

  const heading = P4B_COHORT_FIXTURES['p4b-cohort-heading.md'];
  assert.equal(heading[0], '#');
  assert.equal(heading.includes('# Heading text'), true);
  assert.equal(heading.indexOf('plain paragraph') >= 0, true);

  const emoji = P4B_COHORT_FIXTURES['p4b-cohort-emoji.md'];
  assert.equal(emoji.slice(0, 2), '**');
  assert.equal(emoji.includes('**加粗🚀**'), true);

  const link = P4B_COHORT_FIXTURES['p4b-cohort-link.md'];
  const linkDelimiter = link.indexOf('(https://');
  assert.equal(linkDelimiter >= 0, true);
  assert.equal(link[linkDelimiter], '(');

  const quote = P4B_COHORT_FIXTURES['p4b-cohort-quote.md'];
  assert.equal(quote[0], '>');
  assert.equal(quote.includes('plain paragraph'), true);

  const fence = P4B_COHORT_FIXTURES['p4b-cohort-fence.md'];
  const code = fence.indexOf('const x = 1;');
  assert.equal(code > fence.indexOf('```js'), true);
  assert.equal(fence.includes('const x = 1;'), true);
});
