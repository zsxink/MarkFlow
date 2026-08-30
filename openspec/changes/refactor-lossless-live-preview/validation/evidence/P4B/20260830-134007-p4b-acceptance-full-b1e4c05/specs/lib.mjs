// Shared helpers for the P4B acceptance harness (/tmp only).
import { execFileSync, execSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

export const WS = '/tmp/p4b-acc/ws';
export const SHOTS = '/tmp/p4b-acc/shots';
export const APP_BINARY = '/Users/xian/Project/book/MarkFlow/src-tauri/target/debug/markflow';
export const HID = '/tmp/p4b-acc/hid';

const findings = new Map();

export function record(key, value) {
  findings.set(key, value);
  console.log(`[FINDING] ${key} = ${JSON.stringify(value)}`);
}

export async function dumpFindings(file) {
  const obj = Object.fromEntries(findings);
  await writeFile(file, `${JSON.stringify(obj, null, 2)}\n`);
}

/** Enable the two substrate switches (script-assisted: e2e-only hooks). */
export async function enableBaseFlags() {
  for (const key of ['__setLosslessCoreSession', '__setLivePreview']) {
    const result = await browser.execute((name) => {
      const setter = window[name];
      if (!setter) return 'no-hook';
      setter(true);
      return 'enabled';
    }, key);
    if (result !== 'enabled') throw new Error(`cannot enable ${key}: ${result}`);
  }
  record('substrate.losslessCoreSessionHook', await browser.execute(() => typeof window.__setLosslessCoreSession));
  record('substrate.livePreviewHook', await browser.execute(() => typeof window.__setLivePreview));
  record('substrate.p4bFlagHook', await browser.execute(() => typeof window.__setP4bFlag));
  record('substrate.p4bFlagNames', await browser.execute(() => window.__setP4bFlag?.names ?? null));
}

export async function setFlag(name, value) {
  const result = await browser.execute(([n, v]) => window.__setP4bFlag?.set?.(n, v) ?? false, [name, value]);
  if (result !== true) throw new Error(`cannot set P4B flag ${name}`);
  await refreshProjection();
}

export async function refreshProjection() {
  await browser.execute(() => { window.__markflowLossless?.caret?.(0); });
  await browser.pause(150);
}

export async function openDoc(name) {
  // Never leave a dirty document behind: an unsaved-changes modal would block
  // the next file-tree click and make the following waitUntil time out.
  await browser.execute(async () => {
    if (window.__markflowLossless?.isDirty?.() === true) {
      window.__markflowLossless?.save?.(false);
    }
  }).catch(() => {});
  await browser.waitUntil(async () => await browser.execute(
    () => window.__markflowLossless?.isDirty?.() === false,
  ), { timeout: 5_000 }).catch(() => {});
  await browser.pause(300);
  await browser.execute(() => {
    const btn = document.querySelector('[data-tab="files"]');
    btn?.click();
  });
  const item = await $(`[data-testid="file-tree-item"][data-path$="/${name}"]`);
  await item.waitForDisplayed({ timeout: 15_000 });
  await item.click();
  await browser.waitUntil(async () => await browser.execute(
    (n) => (window.__markflowStore?.getState()?.activeFilePath ?? '').endsWith(`/${n}`), name,
  ), { timeout: 15_000 });
  await browser.waitUntil(async () => await browser.execute(
    () => window.__markflowLossless?.isActive?.() === true,
  ), { timeout: 15_000 });
  await browser.execute(() => window.__markflowLossless?.setMode?.('preview'));
  await browser.waitUntil(async () => await browser.execute(
    () => window.__markflowLossless?.getMode?.() === 'preview',
  ), { timeout: 10_000 });
  await browser.pause(200);
}

/** Read CodeMirror's live IME-composition flag (script-assisted read). */
export function composing() {
  return browser.execute(() => {
    const el = document.querySelector('.source-editor-wrapper .cm-content');
    const v = el?.cmTile?.view ?? el?.cmView?.view;
    return { composing: v?.composing ?? null, viewHasFocus: v?.hasFocus ?? null };
  });
}

export function sourceText() {
  return browser.execute(() => {
    const content = document.querySelector('.source-editor-wrapper .cm-content');
    return content?.cmTile?.view?.state.doc.toString() ?? '';
  });
}

export async function shot(name) {
  await browser.saveScreenshot(`${SHOTS}/${name}.png`);
  return `${name}.png`;
}

// ── Real HID + real system pasteboard ────────────────────────────────────

export function appPid() {
  const out = execFileSync('pgrep', ['-f', APP_BINARY], { encoding: 'utf8' }).trim();
  const pids = out.split('\n').filter(Boolean);
  if (pids.length !== 1) throw new Error(`expected exactly 1 app pid, got ${JSON.stringify(pids)}`);
  return Number(pids[0]);
}

/** Post REAL physical key events (with modifiers) to the running app. */
export function hidKeys(...combos) {
  const pid = appPid();
  const out = execFileSync(HID, [String(pid), ...combos], { encoding: 'utf8' });
  const parsed = JSON.parse(out.trim().split('\n').pop());
  if (!parsed.ok) throw new Error(`hid failed: ${out}`);
  return parsed;
}

/** Read the real macOS general pasteboard as raw bytes. */
export function pbpasteBytes() {
  return execSync('pbpaste', { encoding: 'buffer', maxBuffer: 32 * 1024 * 1024 });
}

export async function workspaceBytes(name) {
  return readFile(`${WS}/${name}`);
}
