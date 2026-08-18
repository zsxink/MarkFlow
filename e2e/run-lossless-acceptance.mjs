// P2/P1B Program Owner acceptance runner.
//
// Reuses the existing e2e harness (temp workspace, e2e binary build, WDIO run)
// but stages the P2 fixtures + P1B byte fixtures into the workspace and runs
// the dedicated acceptance suite. Run:
//   node e2e/run-lossless-acceptance.mjs
import { spawn } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const e2eDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(e2eDir, '..');
const artifactsRoot = path.join(e2eDir, 'artifacts');

const defaultSettings = (workspace) => ({
  version: 1,
  theme: 'light',
  fontSize: 18,
  lineHeight: 1.7,
  autosave: true,
  autosaveInterval: 2000,
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
  } catch {}
  try {
    await rm(path.join(artifactsRoot, 'wdio'), { recursive: true, force: true });
    await cp(path.join(artifactsRoot, 'wdio'), path.join(destination, 'wdio'), { recursive: true });
  } catch {}
}

const tempRunRoot = await mkdtemp(path.join(e2eDir, '.tmp-acc-'));
const runRoot = await realpath(tempRunRoot);
const dataDir = path.join(runRoot, 'data');
const workspace = path.join(runRoot, 'workspace');
const artifactsDir = path.join(artifactsRoot, 'wdio');
const environment = {
  ...process.env,
  MARKFLOW_E2E_DATA_DIR: dataDir,
  MARKFLOW_E2E_WORKSPACE: workspace,
  MARKFLOW_E2E_ARTIFACT_DIR: artifactsRoot,
};

let failed = true;
try {
  await rm(artifactsDir, { recursive: true, force: true });
  await Promise.all([mkdir(dataDir, { recursive: true }), mkdir(workspace, { recursive: true }), mkdir(artifactsDir, { recursive: true })]);
  await writeFile(path.join(dataDir, 'settings.json'), `${JSON.stringify(defaultSettings(workspace), null, 2)}\n`);

  // P2 fixtures.
  await writeFile(path.join(workspace, 'p2-live-preview-switch.md'), '# 切换测试\n\n普通段落。\n');
  const constructs = [
    '# 标题一', '## 二级标题', '',
    '**加粗** 和 *斜体* 和 ~~删除~~ 和 `行内代码`', '',
    '[链接](https://example.com)', '',
    '> 引用段落', '',
    '- 列表项一', '- 列表项二', '',
    '```js', 'const x = 1;', '```', '',
  ].join('\n');
  await writeFile(path.join(workspace, 'p2-live-preview-constructs.md'), constructs);
  await writeFile(path.join(workspace, 'p2-live-preview-zeroedit.md'), '# 零编辑切换\n\n内容不变。\n');
  // Unique constructs copies so each acceptance test starts pristine.
  for (const suffix of ['marker', 'copy', 'ime', 'switch', 'failure']) {
    await writeFile(path.join(workspace, `p2-c-${suffix}.md`), constructs);
  }
  await writeFile(path.join(workspace, 'p2-malformed.md'),
    '```\nunclosed fence\n\n| table |\n| --- |\n| a | b\n\n####### toomany\n\n<<<><>\n');
  await writeFile(path.join(workspace, 'p1b-cjk-emoji.md'), '# 测试文档\n\n这是中文内容。\n');
  await writeFile(path.join(workspace, 'p1b-autosave.md'), '初始内容\n');
  await writeFile(path.join(workspace, 'p1b-a.md'), '文档 A\n');
  await writeFile(path.join(workspace, 'p1b-b.md'), '文档 B\n');
  await writeFile(path.join(workspace, 'p1b-conflict.md'), '冲突测试内容\n');

  // P1B fixtures (byte-contract copies from /Users/xian/markflow-test).
  const p1bNames = ['01-trailing-two-blank-lines.md', '11-crlf-trailing-blank-lines.md', '12-utf8-bom.md', '08-malformed-source-fallback.md'];
  for (const name of p1bNames) {
    await cp(path.join('/Users/xian/markflow-test', name), path.join(workspace, name));
  }

  await run('npm', ['run', 'test:e2e:build'], environment);
  await run('npx', ['wdio', 'run', 'e2e/wdio.conf.mjs', '--suite', 'lossless-acceptance'], environment);
  failed = false;
} finally {
  if (failed) await preserveFailureArtifacts(runRoot, dataDir);
  await rm(runRoot, { recursive: true, force: true });
}
