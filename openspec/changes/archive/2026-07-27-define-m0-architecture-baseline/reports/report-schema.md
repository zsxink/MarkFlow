# M0 Spike Report Schema

Each spike report should include:

| Field | Meaning |
| --- | --- |
| `fixturePath` | Path to the small or generated benchmark fixture. |
| `fixtureBytes` | UTF-8 byte size or source-byte size where measured. |
| `command` | Exact command used to reproduce the result. |
| `candidate` | Parser, engine, or reference implementation candidate. |
| `scenario` | Parser comparison, position mapping, IPC patch, FrontMatter, or reference comparison. |
| `p50Micros` | Median latency in microseconds when benchmarked. |
| `p95Micros` | p95 latency in microseconds when benchmarked. |
| `maxMicros` | Maximum observed latency when benchmarked. |
| `peakMemoryBytes` | Peak memory when measurable; otherwise `null` with a note. |
| `failures` | Failed cases or rejected behaviors. |
| `allowlistReason` | Why an observed failure is acceptable for M0, if it is. |
| `adrReference` | ADR path that consumes this evidence. |

Reports may add candidate-specific fields, but these fields are the shared minimum.

