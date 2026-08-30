/**
 * P4B 7.3 — REAL system IME composition adjacent to a Markdown marker.
 *
 * This spec exists to close the evidence debt recorded in
 * validation/issues/20260830-p4b-real-ime-locked-session.md. It deliberately
 * does NOT accept any of the following as equivalent evidence:
 *
 *   - WebDriver `setValue` / `addValue` text injection (bypasses the IME)
 *   - synthetic `CompositionEvent` dispatch (bypasses the IME)
 *   - `CGEvent.postToPid` (delivers to a process but bypasses Text Input
 *     Services, so no real composition occurs)
 *
 * Real composition requires the app to be FRONTMOST and the events to travel
 * the HID event tap. `e2e/ime/activate.swift` performs both steps; this spec
 * drives it and asserts on the resulting composition event trace.
 *
 * Environment requirements (all checked, none weakened):
 *   - macOS GUI session unlocked, app can become frontmost
 *   - the target input source enabled in the system (Pinyin
 *     `com.apple.inputmethod.SCIM.ITABC` and/or Japanese `Kotoeri`)
 *   - `e2e/ime/activate` built from `activate.swift` (swiftc)
 *
 * Any failure here is a real NO-GO signal for 7.3, not a flake to retry away.
 */
import { execFileSync, execSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { openFileInTree } from '../../page-objects/app.mjs';

const WORKSPACE = process.env.MARKFLOW_E2E_WORKSPACE;
const ARTIFACT_DIR = process.env.MARKFLOW_E2E_ARTIFACT_DIR;
const IME_DIR = path.resolve('e2e/ime');
const ACTIVATE_BIN = path.join(IME_DIR, 'activate');

/** Which input sources the operator has enabled. */
const TARGETS = [
  { id: 'zh-Hans', label: 'Chinese Pinyin', inputMode: 'com.apple.inputmethod.SCIM.ITABC', keys: 'zhongwen ', expect: /[中文]/ },
  { id: 'ja', label: 'Japanese Romaji', inputMode: 'com.apple.inputmethod.Kotoeri.RomajiTyping.Japanese', keys: 'nihongo ', expect: /[日本語ひらがなカタカナ]/ },
];

function buildHelper() {
  execFileSync('swiftc', ['-O', '-o', ACTIVATE_BIN, path.join(IME_DIR, 'activate.swift')], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
}

/** Currently enabled system input sources (machine-readable). */
function enabledInputSources() {
  const out = execSync(
    'defaults read ~/Library/Preferences/com.apple.HIToolbox.plist AppleEnabledInputSources',
    { encoding: 'utf8' },
  );
  return out;
}

function frontmost() {
  return JSON.parse(execFileSync(ACTIVATE_BIN, ['--info'], { encoding: 'utf8' }));
}

function appPid() {
  const out = execSync("pgrep -f 'target/debug/markflow' || true", { encoding: 'utf8' });
  const pids = out.split('\n').map((s) => s.trim()).filter(Boolean);
  return pids.length ? pids[0] : null;
}

async function openFixtureAndPlaceCaret(name, offset) {
  await openFileInTree(name);
  await browser.waitUntil(
    async () => await browser.execute((n) => (window.__markflowStore?.getState()?.activeFilePath ?? '').endsWith(`/${n}`), name),
    { timeout: 10_000 },
  );
  await browser.waitUntil(async () => await browser.execute(() => window.__markflowLossless?.isActive?.() === true), { timeout: 10_000 });
  await browser.execute(() => window.__markflowLossless?.setMode?.('preview'));
  await browser.waitUntil(async () => await browser.execute(() => window.__markflowLossless?.getMode?.() === 'preview'), { timeout: 5_000 });
  // Move the caret to the marker-adjacent offset via the lossless seam.
  await browser.execute((o) => window.__markflowLossless?.caret?.(o), offset);
  await browser.pause(150);
}

async function installCompositionRecorder() {
  await browser.execute(() => {
    const el = document.querySelector('.cm-content') ?? document.querySelector('[contenteditable="true"]');
    if (!el) throw new Error('no editable surface for composition recorder');
    window.__imeLog = [];
    window.__imeTarget = el.className || el.tagName;
    const push = (type, data) => {
      window.__imeLog.push({ type, data: data ?? null, t: Date.now() });
    };
    for (const type of ['compositionstart', 'compositionupdate', 'compositionend']) {
      el.addEventListener(type, (e) => push(type, e.data ?? null), true);
    }
    el.addEventListener('beforeinput', (e) => push('beforeinput', e.data ?? null), true);
    el.addEventListener('input', (e) => push('input', e.data ?? null), true);
  });
}

function docText() {
  return browser.execute(() => {
    const content = document.querySelector('.source-editor-wrapper .cm-content');
    return content?.cmTile?.view?.state.doc.toString()
      ?? document.querySelector('.cm-content')?.cmView?.view?.state.doc.toString()
      ?? '';
  });
}

export function registerP4bRealImeTests() {
  describe('P4B 7.3 — real system IME composition next to a marker', () => {
    it('records a real composition trace for every enabled CJK input source', async () => {
      const sources = enabledInputSources();
      const available = TARGETS.filter((t) => sources.includes(t.inputMode));

      const report = {
        suite: 'p4b-real-ime',
        startedAt: new Date().toISOString(),
        enabledInputSourcesSample: sources.replace(/\s+/g, ' ').slice(0, 400),
        frontmostBefore: frontmost(),
        targets: [],
      };

      if (available.length === 0) {
        await writeFile(
          path.join(ARTIFACT_DIR, 'p4b-real-ime-NOT-RUN.json'),
          JSON.stringify({ ...report, reason: 'no target CJK input source enabled in this GUI session' }, null, 2),
        );
        throw new Error(
          'P4B 7.3 requires a real CJK input source. Neither Pinyin nor Kotoeri is enabled. '
          + 'Enable at least one in System Settings → Keyboard → Input Sources, then rerun. '
          + 'WebDriver text injection is NOT accepted as a substitute.',
        );
      }

      buildHelper();

      for (const target of available) {
        const fixture = `p4b-ime-${target.id}.md`;
        const original = await readFile(path.join(WORKSPACE, fixture), 'utf8');

        await openFixtureAndPlaceCaret(fixture, 1); // immediately after `#`
        await installCompositionRecorder();

        const pid = appPid();
        if (!pid) throw new Error(`cannot locate the running markflow process for ${target.id}`);

        const activated = JSON.parse(
          execFileSync(ACTIVATE_BIN, [pid], { encoding: 'utf8' }),
        );
        if (!activated.becameFrontmost) {
          throw new Error(`markflow (pid ${pid}) could not become frontmost; real IME impossible. got=${JSON.stringify(activated.frontmost)}`);
        }

        // Real physical keystrokes through the HID event tap.
        const typed = JSON.parse(
          execFileSync(ACTIVATE_BIN, [pid, '--keys', target.keys], { encoding: 'utf8' }),
        );

        // Wait for a genuine compositionend (never synthesize one).
        let log = [];
        try {
          await browser.waitUntil(async () => {
            log = await browser.execute(() => window.__imeLog ?? []);
            return log.some((e) => e.type === 'compositionend');
          }, { timeout: 8_000, timeoutMsg: `no real compositionend for ${target.id}` });
        } catch (err) {
          log = await browser.execute(() => window.__imeLog ?? []);
        }

        const after = await docText();
        const types = log.map((e) => e.type);
        const composed = log.find((e) => e.type === 'compositionend')?.data ?? '';

        // A single Cmd+Z must restore the exact original source.
        await browser.execute(() => window.__markflowLossless?.focus?.());
        await browser.keys(['Meta', 'z']);
        await browser.keys(['Meta']); // release
        await browser.pause(400);
        const undone = await docText();

        report.targets.push({
          id: target.id,
          label: target.label,
          inputMode: target.inputMode,
          keysSent: target.keys,
          activate: activated,
          typed,
          compositionTrace: log,
          eventTypes: types,
          hasStart: types.includes('compositionstart'),
          hasUpdate: types.includes('compositionupdate'),
          hasEnd: types.includes('compositionend'),
          composedText: composed,
          matchesExpectedScript: target.expect.test(composed),
          docAfter: after,
          docAfterUndo: undone,
          undoRestoredOriginal: undone === original,
          original,
        });
      }

      await mkdir(ARTIFACT_DIR, { recursive: true });
      await writeFile(path.join(ARTIFACT_DIR, 'p4b-real-ime.json'), JSON.stringify(report, null, 2));

      for (const t of report.targets) {
        expect(t.hasStart, `${t.id}: compositionstart`).toBe(true);
        expect(t.hasUpdate, `${t.id}: compositionupdate`).toBe(true);
        expect(t.hasEnd, `${t.id}: compositionend`).toBe(true);
        expect(t.matchesExpectedScript, `${t.id}: committed "${t.composedText}" is CJK`).toBe(true);
        expect(t.docAfter, `${t.id}: committed text adjacent to marker`).toContain(t.composedText);
        expect(t.undoRestoredOriginal, `${t.id}: one Undo restores the exact original source`).toBe(true);
      }
    });
  });
}

// Suite entry point (`--suite ime`). Not registered into all-lossless: the
// ordinary suites must stay runnable without an unlocked GUI session.
registerP4bRealImeTests();
