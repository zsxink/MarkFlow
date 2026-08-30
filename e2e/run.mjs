import { spawn } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeP4bCohortFixtures } from './p4b-cohort-fixtures.mjs';

const suite = process.argv[2] ?? 'smoke';
if (!['smoke', 'regression', 'p0s', 'lossless', 'ime'].includes(suite)) {
  throw new Error(`Unknown E2E suite: ${suite}`);
}

const e2eDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(e2eDir, '..');
const artifactsRoot = path.join(e2eDir, 'artifacts');

// ── P0S suite runs with autosave ENABLED so the zero-edit autosave lifecycle
// and immediate Save/A→B/close paths are exercised against the real product
// configuration. A short interval makes the two-tick wait deterministic in CI;
// the product default 10000ms interval is covered by the manual desktop E3 and
// the lifecycle integration tests (main.lifecycle.guard.test.ts).
// ── The IME suite keeps autosave OFF: it asserts that a single Undo restores
// the exact original source, and an intervening autosave tick would make that
// assertion meaningless.
const autosaveEnabled = suite === 'p0s' || suite === 'lossless';

const defaultSettings = (workspace) => ({
  version: 1,
  theme: 'light',
  fontSize: 18,
  lineHeight: 1.7,
  autosave: autosaveEnabled,
  autosaveInterval: autosaveEnabled ? 2000 : 10000,
  spellcheck: true,
  softWrap: true,
  livePreview: true,
  codeHighlight: true,
  plantumlServerUrl: '',
  showSidebar: true,
  showTooltips: true,
  followSystemTheme: false,
  lastWorkspace: workspace,
  imageStorageMode: 'workspace-assets',
  imageCustomPath: '',
  imagePreferRelative: true,
  imageAutoCopyLocal: true,
  imageDownloadNetwork: false,
  imageNamingStrategy: 'timestamp',
  codeLineNumbers: false,
  codeWordWrap: true,
  largeFileThreshold: 1048576,
  hugeFileThreshold: 10485760,
  largeFileLineThreshold: 5000,
  hugeFileLineThreshold: 50000,
  fileTreeIgnorePatterns: ['.git', 'node_modules', 'target', 'dist'],
  fileTreePageSize: 500,
  fileTreeAutoLoadDepth: 8,
  recentFiles: [],
  recentFolders: [workspace],
  lastWindowWidth: 1200,
  lastWindowHeight: 800,
  lastWindowX: 0,
  lastWindowY: 0,
});

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: projectRoot, env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with ${signal ?? code}`));
    });
  });
}

function redact(text, runRoot) {
  return text
    .replaceAll(runRoot, '<e2e-root>')
    .replace(/([?&](?:token|secret|password|key)=)[^&\s]+/gi, '$1<redacted>')
    .replace(/(Authorization:\s*Bearer\s+)[^\s]+/gi, '$1<redacted>');
}

async function preserveFailureArtifacts(runRoot, dataDir) {
  const destination = path.join(artifactsRoot, `failed-${Date.now()}`);
  await mkdir(destination, { recursive: true });
  const logsDir = path.join(dataDir, 'logs');
  try {
    for (const entry of await readdir(logsDir)) {
      const source = path.join(logsDir, entry);
      const content = await readFile(source, 'utf8');
      await writeFile(path.join(destination, entry), redact(content, runRoot));
    }
  } catch {
    // The app can fail before logger initialization; WDIO artifacts still explain that case.
  }
  await copyRedactedDirectory(path.join(artifactsRoot, 'wdio'), path.join(destination, 'wdio'), runRoot).catch(() => {});
}

async function copyRedactedDirectory(source, destination, runRoot) {
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      await copyRedactedDirectory(from, to, runRoot);
    } else if (/\.(?:log|txt|json)$/i.test(entry.name)) {
      await writeFile(to, redact(await readFile(from, 'utf8'), runRoot));
    } else {
      await cp(from, to, { force: true });
    }
  }
}

// Keep ephemeral state inside the repository rather than macOS's /var symlink,
// whose lexical and canonical forms differ during backend workspace validation.
const tempRunRoot = await mkdtemp(path.join(e2eDir, '.tmp-'));
const runRoot = await realpath(tempRunRoot);
const dataDir = path.join(runRoot, 'data');
const workspace = path.join(runRoot, 'workspace');
const artifactsDir = path.join(artifactsRoot, 'wdio');
const environment = {
  ...process.env,
  MARKFLOW_E2E_DATA_DIR: dataDir,
  MARKFLOW_E2E_WORKSPACE: workspace,
  MARKFLOW_E2E_ARTIFACT_DIR: artifactsRoot,
  // The real-IME suite posts physical keystrokes through the HID tap for two
  // input sources; 60s is not enough and a timeout there is unactionable.
  MARKFLOW_E2E_MOCHA_TIMEOUT: suite === 'ime' ? '240000' : '60000',
};

let failed = true;
try {
  await rm(artifactsDir, { recursive: true, force: true });
  await Promise.all([mkdir(dataDir, { recursive: true }), mkdir(workspace, { recursive: true }), mkdir(artifactsDir, { recursive: true })]);
  await writeFile(path.join(dataDir, 'settings.json'), `${JSON.stringify(defaultSettings(workspace), null, 2)}\n`);
  await writeFile(path.join(workspace, 'welcome.md'), '# MarkFlow E2E Testing\n\n这是 E2E 测试的初始文档，包含段落内容。\n\n- 列表项一\n- 列表项二\n- 列表项三\n');
  // ── P2 Live Preview fixtures (lossless suite only) ─────────────────────
  // Written inline: they cover every basic construct for the semantic
  // decoration E2E + a zero-edit mode-switch byte-contract case.
  if (suite === 'lossless') {
    await writeP4bCohortFixtures(workspace);
    await writeFile(path.join(workspace, 'p4b-widget-task.md'), '- [ ] widget task 🚀\n- [x] already done\n');
    await writeFile(path.join(workspace, 'p4b-widget-fence.md'), 'before\n\n```js title="keep"\nconst x = 1;\n```\n\nafter\n');
    await writeFile(path.join(workspace, 'p4b-policy-html.md'), '<script>window.__p4bExecuted = true</script>\n<div data-x="1">raw</div>\n');
    await writeFile(path.join(workspace, 'p4b-policy-frontmatter.md'), '---\ntitle: Exact source\ntags: [a, b]\n---\n\n# Body\n');
    // P2 Live Preview fixtures cover every basic construct for the semantic
    // decoration E2E + a zero-edit mode-switch byte-contract case.
    await writeFile(path.join(workspace, 'p2-live-preview-switch.md'),
      '# 切换测试\n\n普通段落。\n');
    await writeFile(path.join(workspace, 'p2-live-preview-constructs.md'),
      [
        '# 标题一', '## 二级标题', '',
        '**加粗** 和 *斜体* 和 ~~删除~~ 和 `行内代码`', '',
        '[链接](https://example.com)', '',
        '> 引用段落', '',
        '- 列表项一', '- 列表项二', '',
        '```js', 'const x = 1;', '```', '',
      ].join('\n'));
    await writeFile(path.join(workspace, 'p2-live-preview-zeroedit.md'),
      '# 零编辑切换\n\n内容不变。\n');
  }
  // ── P4B 7.3 real-IME fixtures ─────────────────────────────────────────
  // `# marker\n` / `> marker\n` mirror the frozen strings from the earlier
  // blocked attempt so the new evidence is directly comparable.
  if (suite === 'ime') {
    await writeFile(path.join(workspace, 'p4b-ime-zh-Hans.md'), '# marker\n');
    await writeFile(path.join(workspace, 'p4b-ime-ja.md'), '> marker\n');
  }
  // ── P0S lifecycle fixtures (byte-contract copies, autosave ENABLED) ──
  if (autosaveEnabled) {
    const fixturesDir = path.join(projectRoot, 'tests/fixtures/byte-contract/fixtures');
    const names = suite === 'lossless'
      ? [
          // Lossless vertical slice: every canonical EOL/BOM/tail boundary +
          // CJK/emoji and structure fixtures for the edit-save path.
          'utf8-lf-tail0.md', 'utf8-lf-tail1.md', 'utf8-lf-tail2.md', 'utf8-lf-tail3.md',
          'utf8-crlf-tail1.md', 'utf8-crlf-tail2.md', 'utf8-crlf-tail3.md',
          'utf8-cr-tail1.md', 'utf8-mixed-tail2.md', 'utf8-bom-lf-tail2.md',
          'unicode-cjk.md', 'unicode-emoji.md', 'syntax-lists.md',
        ]
      : ['utf8-lf-tail2.md', 'utf8-lf-tail3.md', 'utf8-crlf-tail2.md', 'utf8-crlf-tail3.md', 'utf8-cr-tail1.md', 'utf8-mixed-tail2.md', 'utf8-bom-lf-tail2.md'];
    for (const name of names) {
      await cp(path.join(fixturesDir, name), path.join(workspace, name));
    }
  }
  await run('npm', ['run', 'test:e2e:build'], environment);
  await run('npx', ['wdio', 'run', 'e2e/wdio.conf.mjs', '--suite', suite], environment);
  failed = false;
} finally {
  if (failed) await preserveFailureArtifacts(runRoot, dataDir);
  await rm(runRoot, { recursive: true, force: true });
}
