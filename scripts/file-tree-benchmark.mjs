import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';

const count = Math.max(1, Number(process.argv[2] || 10_000));
const root = await mkdtemp(join(tmpdir(), 'markflow-tree-bench-'));
const ignored = ['node_modules', 'target'];

async function createFixture() {
  const started = performance.now();
  for (let start = 0; start < count; start += 1000) {
    const dir = join(root, `group-${String(start / 1000).padStart(3, '0')}`);
    await mkdir(dir, { recursive: true });
    await Promise.all(Array.from({ length: Math.min(1000, count - start) }, (_, offset) =>
      writeFile(join(dir, `file-${String(start + offset).padStart(6, '0')}.md`), '# benchmark\n')));
  }
  let deep = root;
  for (let depth = 0; depth < 64; depth++) { deep = join(deep, `deep-${depth}`); await mkdir(deep); }
  for (const name of ignored) {
    const dir = join(root, name); await mkdir(dir);
    await Promise.all(Array.from({ length: 1000 }, (_, index) => writeFile(join(dir, `churn-${index}.tmp`), 'x')));
  }
  const wide = join(root, 'wide');
  await mkdir(wide);
  await Promise.all(Array.from({ length: Math.min(5000, count) }, (_, index) => writeFile(join(wide, `wide-${index}.md`), 'x')));
  return performance.now() - started;
}

async function benchmarkGitCheckout() {
  const repo = join(root, 'git-scenario');
  await mkdir(repo);
  const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
  git('init', '-q'); git('config', 'user.email', 'benchmark@markflow.local'); git('config', 'user.name', 'MarkFlow Benchmark');
  await Promise.all(Array.from({ length: 500 }, (_, index) => writeFile(join(repo, `git-${index}.md`), 'main')));
  git('add', '.'); git('commit', '-qm', 'baseline'); git('checkout', '-qb', 'benchmark-change');
  await Promise.all(Array.from({ length: 500 }, (_, index) => writeFile(join(repo, `git-${index}.md`), 'branch')));
  git('commit', '-qam', 'branch');
  const started = performance.now();
  git('checkout', '-q', '-');
  return performance.now() - started;
}

function benchmarkEventMerge() {
  const events = [];
  for (let index = 0; index < 10_000; index++) events.push(`src/file-${index % 500}.md:modify`);
  const started = performance.now();
  const merged = new Set(events);
  return { eventMergeMs: performance.now() - started, rawEvents: events.length, mergedEvents: merged.size };
}

async function recursiveCount(path) {
  let total = 0;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || ignored.includes(entry.name)) continue;
    total++;
    if (entry.isDirectory()) total += await recursiveCount(join(path, entry.name));
  }
  return total;
}

try {
  const fixtureMs = await createFixture();
  let started = performance.now();
  const rootEntries = (await readdir(root, { withFileTypes: true })).filter(entry => !ignored.includes(entry.name));
  const shallowMs = performance.now() - started;
  started = performance.now();
  const recursiveNodes = await recursiveCount(root);
  const recursiveMs = performance.now() - started;
  const gitCheckoutMs = await benchmarkGitCheckout();
  const eventMetrics = benchmarkEventMerge();
  const result = {
    seed: 88, files: count, ignoredChurnFiles: ignored.length * 1000, deepLevels: 64,
    fixtureMs: Number(fixtureMs.toFixed(2)), rootEntries: rootEntries.length,
    shallowMs: Number(shallowMs.toFixed(2)), recursiveNodes,
    recursiveMs: Number(recursiveMs.toFixed(2)), wideDirectoryFiles: Math.min(5000, count),
    gitCheckoutFiles: 500, gitCheckoutMs: Number(gitCheckoutMs.toFixed(2)),
    rawEvents: eventMetrics.rawEvents, mergedEvents: eventMetrics.mergedEvents,
    eventMergeMs: Number(eventMetrics.eventMergeMs.toFixed(2)), pageSize: 500,
    queueCapacity: 2048, coalesceWindowMs: 150, domVirtualizationThreshold: 5000,
  };
  console.log(JSON.stringify(result, null, 2));
} finally {
  await rm(root, { recursive: true, force: true });
}
