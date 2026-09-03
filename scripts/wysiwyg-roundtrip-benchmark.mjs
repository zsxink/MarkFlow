import MarkdownIt from 'markdown-it';
import { performance } from 'node:perf_hooks';

// This is the stage-one v2 baseline: MarkdownIt is the parser used by the
// current tiptap-markdown chain.  No v3 adapter is imported or benchmarked.
const parser = new MarkdownIt({ html: false, breaks: false, linkify: false, typographer: false });
const rounds = Math.max(5, Number(process.argv[2] || 30));
const fence = '```';
const documents = {
  small: '# Small\n\nA **short** document with [a link](https://example.test).\n',
  medium: Array.from({ length: 40 }, (_, i) => `## Section ${i + 1}\n\n- item **${i}**\n- [ ] task\n\n| A | B |\n| --- | --- |\n| ${i} | value |\n`).join('\n'),
  large: Array.from({ length: 400 }, (_, i) => `### Section ${i + 1}\n\nParagraph ${i} with *emphasis*, \`inline\` code and [link](https://example.test/${i}).\n\n- one\n  - two\n\n${fence}text\nline ${i}\n${fence}\n`).join('\n'),
};

function cycle(markdown) {
  const parsed = parser.parse(markdown, {});
  const serialized = parser.renderer.render(parsed, parser.options, {});
  parser.parse(serialized, {});
  return serialized.length;
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

const result = { baseline: 'v2-markdown-it', rounds, generatedAt: 'omitted-for-reproducibility', documents: {} };
for (const [tier, markdown] of Object.entries(documents)) {
  // Warm up parser internals before collecting measurements.
  for (let i = 0; i < 3; i++) cycle(markdown);
  const durations = [];
  const heapBefore = process.memoryUsage().heapUsed;
  let serializedLength = 0;
  for (let i = 0; i < rounds; i++) {
    const started = performance.now();
    serializedLength = cycle(markdown);
    durations.push(performance.now() - started);
  }
  const heapAfter = process.memoryUsage().heapUsed;
  result.documents[tier] = {
    inputBytes: Buffer.byteLength(markdown),
    serializedBytes: serializedLength,
    p50Ms: Number(percentile(durations, 0.5).toFixed(3)),
    p95Ms: Number(percentile(durations, 0.95).toFixed(3)),
    heapDeltaBytes: heapAfter - heapBefore,
  };
}
console.log(JSON.stringify(result, null, 2));
