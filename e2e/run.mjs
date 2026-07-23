import { spawn } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const suite = process.argv[2] ?? 'smoke';
if (!['smoke', 'regression'].includes(suite)) {
  throw new Error(`Unknown E2E suite: ${suite}`);
}

const e2eDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(e2eDir, '..');
const artifactsRoot = path.join(e2eDir, 'artifacts');

const defaultSettings = (workspace) => ({
  version: 1,
  theme: 'light',
  fontSize: 18,
  lineHeight: 1.7,
  autosave: false,
  autosaveInterval: 10000,
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
};

let failed = true;
try {
  await rm(artifactsDir, { recursive: true, force: true });
  await Promise.all([mkdir(dataDir, { recursive: true }), mkdir(workspace, { recursive: true }), mkdir(artifactsDir, { recursive: true })]);
  await writeFile(path.join(dataDir, 'settings.json'), `${JSON.stringify(defaultSettings(workspace), null, 2)}\n`);
  await writeFile(path.join(workspace, 'welcome.md'), '# MarkFlow E2E Testing\n\n这是 E2E 测试的初始文档，包含段落内容。\n\n- 列表项一\n- 列表项二\n- 列表项三\n');
  await run('npm', ['run', 'test:e2e:build'], environment);
  await run('npx', ['wdio', 'run', 'e2e/wdio.conf.mjs', '--suite', suite], environment);
  failed = false;
} finally {
  if (failed) await preserveFailureArtifacts(runRoot, dataDir);
  await rm(runRoot, { recursive: true, force: true });
}
