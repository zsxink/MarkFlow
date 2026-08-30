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
 * Input sources are discovered and switched through Text Input Services (TIS),
 * NOT by reading `~/Library/Preferences/com.apple.HIToolbox.plist`. That plist
 * is a stale cache: it reported Japanese Kotoeri as absent while TIS correctly
 * reported it as installed and selectable. Trusting it silently reduced 7.3 to
 * a Chinese-only run, which would have been exactly the kind of quiet
 * standard-lowering this spec exists to prevent.
 *
 * Environment requirements (all checked, none weakened):
 *   - macOS GUI session unlocked, app can become frontmost
 *   - the target input source installed (Pinyin SCIM.ITABC and Kotoeri)
 *   - `e2e/ime/activate` built from `activate.swift` (swiftc)
 *
 * Any failure here is a real NO-GO signal for 7.3, not a flake to retry away.
 */
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { openFileInTree } from '../../page-objects/app.mjs';

const WORKSPACE = process.env.MARKFLOW_E2E_WORKSPACE;
const ARTIFACT_DIR = process.env.MARKFLOW_E2E_ARTIFACT_DIR;
const IME_DIR = path.resolve('e2e/ime');
const ACTIVATE_BIN = path.join(IME_DIR, 'activate');

/** Which input sources 7.3 must cover, and what each must produce. */
const TARGETS = [
  {
    id: 'zh-Hans',
    label: 'Chinese Pinyin',
    inputMode: 'com.apple.inputmethod.SCIM.ITABC',
    keys: 'zhongwen ',
    expect: /[一-鿿]/,
  },
  {
    id: 'ja',
    label: 'Japanese Romaji',
    inputMode: 'com.apple.inputmethod.Kotoeri.RomajiTyping.Japanese',
    // Kotoeri auto-commits a complete word like "nihongo" to 日本語. Adding a
    // trailing space would insert a full-width space and complicate the undo
    // assertion, so we stop at the committed word.
    keys: 'nihongo',
    expect: /[぀-ヿ一-鿿]/,
  },
];

function buildHelper() {
  execFileSync('swiftc', ['-O', '-o', ACTIVATE_BIN, path.join(IME_DIR, 'activate.swift')], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
}

function jsonCall(...args) {
  return JSON.parse(execFileSync(ACTIVATE_BIN, args, { encoding: 'utf8' }));
}

function frontmost() { return jsonCall('--info'); }
function currentSource() { return jsonCall('--current'); }

/** Every installed input source, straight from TIS. */
function installedSources() {
  return jsonCall('--list-sources').sources ?? [];
}

/**
 * Make `id` the active input source. Kotoeri's input *modes* must be enabled
 * before they can be selected — `TISSelectInputSource` alone returns
 * paramErr(-50) for them, which would otherwise look like "Japanese is
 * unavailable".
 */
function selectSource(id) {
  const enabled = jsonCall('--enable', id);
  const selected = jsonCall('--select', id);
  const now = currentSource();
  return { enabled, selected, activeId: now.id ?? null, ok: now.id === id };
}

function appPid() {
  const out = execFileSync('bash', ['-c', "pgrep -f 'target/debug/markflow' || true"], { encoding: 'utf8' });
  const pids = out.split('\n').map((s) => s.trim()).filter(Boolean);
  return pids.length ? pids[0] : null;
}

async function openFixtureAndPlaceCaret(name, offset) {
  // Opening a second file in the same session occasionally needs a re-click
  // (the first click can land while the tree is still settling after the
  // preceding target's edits). Retry rather than fail the whole 7.3 run, and
  // report the observed path when it still does not switch.
  let activePath = '';
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await openFileInTree(name);
    try {
      await browser.waitUntil(
        async () => {
          activePath = await browser.execute(() => window.__markflowStore?.getState()?.activeFilePath ?? '');
          return activePath.endsWith(`/${name}`);
        },
        { timeout: 5_000 },
      );
      break;
    } catch (err) {
      if (attempt === 3) {
        throw new Error(
          `file ${name} never became active (attempt ${attempt}); observed activeFilePath=${JSON.stringify(activePath)}`,
        );
      }
      await browser.pause(500);
    }
  }
  await browser.waitUntil(async () => await browser.execute(() => window.__markflowLossless?.isActive?.() === true), { timeout: 10_000 });
  await browser.execute(() => window.__markflowLossless?.setMode?.('preview'));
  await browser.waitUntil(async () => await browser.execute(() => window.__markflowLossless?.getMode?.() === 'preview'), { timeout: 5_000 });
  // A real click is what gives the WebView text input system keyboard focus.
  // Without it the HID-tap keystrokes have no focused text input to land in
  // and the run would look like "the IME did nothing".
  const content = await $('.cm-content');
  await content.click();
  await browser.waitUntil(
    async () => await browser.execute(() => {
      const el = document.activeElement;
      return !!el && (el.classList.contains('cm-content') || el.getAttribute('contenteditable') === 'true');
    }),
    { timeout: 5_000, timeoutMsg: 'editor content did not take keyboard focus' },
  );
  await browser.execute((o) => window.__markflowLossless?.caret?.(o), offset);
  await browser.pause(150);
}

async function installCompositionRecorder() {
  await browser.execute(() => {
    const el = document.querySelector('.cm-content') ?? document.querySelector('[contenteditable="true"]');
    if (!el) throw new Error('no editable surface for composition recorder');
    window.__imeLog = [];
    const push = (type, data, inputType, isComposing) => {
      window.__imeLog.push({ type, data: data ?? null, inputType: inputType ?? null, isComposing: isComposing ?? null, t: Date.now() });
    };
    // `inputType` is the discriminator that decides whether CodeMirror's own
    // missed-compositionend workaround can fire (it only matches insertText),
    // so it is captured for every event rather than only for the commit.
    // `isComposing` is the browser's own verdict on whether the composition is
    // still live: an auto-committed word that arrives with isComposing === false
    // is terminally committed, which is the only safe signal to finalize on.
    for (const type of ['compositionstart', 'compositionupdate', 'compositionend']) {
      el.addEventListener(type, (e) => push(type, e.data ?? null), true);
    }
    el.addEventListener('beforeinput', (e) => push('beforeinput', e.data ?? null, e.inputType, e.isComposing), true);
    el.addEventListener('input', (e) => push('input', e.data ?? null, e.inputType, e.isComposing), true);
  });
}

/**
 * Read the live CodeMirror composition state together with the fact that
 * decides whether upstream's "missed compositionend" workaround applies:
 * `browser.safari` is derived from `navigator.vendor` being "Apple Computer".
 */
function cmCompositionProbe() {
  return browser.execute(() => {
    const el = document.querySelector('.cm-content');
    const view = el?.cmTile?.view ?? el?.cmView?.view ?? null;
    return {
      vendor: navigator.vendor ?? null,
      looksLikeSafari: /Apple Computer/.test(navigator.vendor ?? ''),
      viewFound: !!view,
      composing: view ? view.composing : null,
      inputStateComposing: view?.inputState?.composing ?? null,
      hasFocus: document.hasFocus(),
    };
  });
}

function focusState() {
  return browser.execute(() => {
    const el = document.activeElement;
    const cm = document.querySelector('.cm-content');
    let visible = null;
    if (cm) {
      const r = cm.getBoundingClientRect();
      visible = r.width > 0 && r.height > 0 && getComputedStyle(cm).visibility !== 'hidden';
    }
    return {
      activeTag: el?.tagName ?? null,
      activeClass: el?.className ?? null,
      activeIsCmContent: !!el && el === cm,
      docHasFocus: document.hasFocus(),
      cmContentExists: !!cm,
      cmContentVisible: visible,
    };
  });
}

/** AX view of the app: distinguishes "frontmost" from "window actually key". */
function axSnapshot(pid) {
  try {
    const nodes = jsonCall('--axwalk', pid).nodes ?? [];
    return nodes
      .filter((n) => ['AXWindow', 'AXWebView', 'AXTextArea', 'AXTextField', 'AXGroup'].includes(n.role))
      .slice(0, 10)
      .map((n) => ({ depth: n.depth, role: n.role, value: n.value.slice(0, 60), valueLen: n.valueLen, children: n.children }));
  } catch (err) {
    return { error: String(err?.message ?? err).slice(0, 200) };
  }
}

function docText() {
  return browser.execute(() => {
    const content = document.querySelector('.source-editor-wrapper .cm-content');
    return content?.cmTile?.view?.state.doc.toString()
      ?? document.querySelector('.cm-content')?.cmView?.view?.state.doc.toString()
      ?? '';
  });
}

/**
 * Undo the preflight keystroke by cancelling any live composition (Escape) and
 * then deleting only while the document still differs from the original.
 *
 * This matters: an un-cancelled preflight composition stays open, so the real
 * keystrokes continue it ("x" + "zhongwen" → 学中文) and `compositionstart`
 * never appears in the recorded trace — a false negative that looks like a
 * product defect.
 */
async function cancelPreflight(pid, original) {
  jsonCall(pid, '--keys', '\\e');
  await browser.pause(250);
  for (let i = 0; i < 12; i += 1) {
    if ((await docText()) === original) return { restored: true, backspaces: i };
    jsonCall(pid, '--keys', '\\b');
    await browser.pause(200);
  }
  return { restored: (await docText()) === original, backspaces: 12 };
}

export function registerP4bRealImeTests() {
  describe('P4B 7.3 — real system IME composition next to a marker', () => {
    // Real IME is slow: activation retries, HID posting at 70ms/key, a genuine
    // composition round-trip, and per-source switching. The 60s mocha default
    // turns any slow step into an unactionable timeout.
    it('records a real composition trace for every required CJK input source', async function () {
      this.timeout(240_000);

      const installed = installedSources();
      const byId = new Map(installed.map((s) => [s.id, s]));
      const originalSource = currentSource();

      const report = {
        suite: 'p4b-real-ime',
        startedAt: new Date().toISOString(),
        frontmostBefore: frontmost(),
        originalSource: originalSource.id ?? null,
        installedSourceCount: installed.length,
        steps: [],
        targets: [],
      };

      // Every step is persisted immediately. A hang or hard timeout must still
      // leave evidence of how far the run got, otherwise the only signal is a
      // bare "Timeout".
      let mark = async (step) => {
        report.steps.push({ step, at: new Date().toISOString() });
        await mkdir(ARTIFACT_DIR, { recursive: true });
        await writeFile(path.join(ARTIFACT_DIR, 'p4b-real-ime-progress.json'), JSON.stringify(report, null, 2));
      };
      await mark('initialized');

      const missing = TARGETS.filter((t) => !byId.has(t.inputMode));
      report.missing = missing.map((t) => ({ id: t.id, label: t.label, inputMode: t.inputMode }));

      if (missing.length === TARGETS.length) {
        await mkdir(ARTIFACT_DIR, { recursive: true });
        await writeFile(
          path.join(ARTIFACT_DIR, 'p4b-real-ime-NOT-RUN.json'),
          JSON.stringify({ ...report, reason: 'no required CJK input source installed' }, null, 2),
        );
        throw new Error(
          'P4B 7.3 requires a real CJK input source. Neither Pinyin nor Kotoeri is installed. '
          + 'WebDriver text injection is NOT accepted as a substitute.',
        );
      }

      buildHelper();

      const available = TARGETS.filter((t) => byId.has(t.inputMode));
      let restored = false;

      try {
        for (const target of available) {
          const fixture = `p4b-ime-${target.id}.md`;
          const original = await readFile(path.join(WORKSPACE, fixture), 'utf8');

          await mark(`${target.id}:openFixture`);
          await openFixtureAndPlaceCaret(fixture, 1); // immediately after `#`
          await mark(`${target.id}:caretPlaced`);
          await installCompositionRecorder();

          const pid = appPid();
          if (!pid) throw new Error(`cannot locate the running markflow process for ${target.id}`);

          // Put the target IME in charge BEFORE typing, and prove it is.
          const selection = selectSource(target.inputMode);
          if (!selection.ok) {
            throw new Error(
              `could not activate ${target.label} (${target.inputMode}); `
              + `active=${selection.activeId} enable=${JSON.stringify(selection.enabled)} select=${JSON.stringify(selection.selected)}`,
            );
          }

          // Focus is contended on a live desktop: other applications can take
          // the foreground between our launch and our typing. Retry activation,
          // and only proceed once MarkFlow is provably frontmost — posting HID
          // keystrokes while a foreign app is frontmost would type into THAT app.
          let activated = null;
          const activationAttempts = [];
          for (let attempt = 1; attempt <= 12; attempt += 1) {
            const res = jsonCall(pid);
            activationAttempts.push({ attempt, becameFrontmost: res.becameFrontmost, frontmost: res.frontmost });
            if (res.becameFrontmost) { activated = res; break; }
            await browser.pause(500);
          }
          if (!activated) {
            throw new Error(
              `markflow (pid ${pid}) could not become frontmost after 12 attempts; real IME impossible. `
              + `attempts=${JSON.stringify(activationAttempts)}`,
            );
          }

          await mark(`${target.id}:frontmost`);
          const focusBefore = await focusState();

          // PREFLIGHT: prove HID keystrokes actually reach the editor before
          // blaming (or crediting) the IME. Without this, "no composition" is
          // ambiguous between "keys never arrived" and "IME never engaged".
          const preflightTyped = jsonCall(pid, '--keys', 'x');
          let preflightLog = [];
          try {
            await browser.waitUntil(async () => {
              preflightLog = await browser.execute(() => window.__imeLog ?? []);
              return preflightLog.length > 0;
            }, { timeout: 5_000 });
          } catch { /* recorded below */ }
          preflightLog = await browser.execute(() => window.__imeLog ?? []);
          const preflightDelivered = preflightLog.length > 0;

          if (!preflightDelivered) {
            const diag = {
              ax: axSnapshot(pid),
              activate: activated,
              activationAttempts,
              focusAfter: await focusState(),
              focusBefore,
              frontmostNow: frontmost(),
              preflightTyped,
              reason: 'HID keystrokes did not reach the editor; real IME cannot be exercised',
              target: target.id,
            };
            await mkdir(ARTIFACT_DIR, { recursive: true });
            await writeFile(path.join(ARTIFACT_DIR, `p4b-real-ime-preflight-failed-${target.id}.json`), JSON.stringify(diag, null, 2));
            throw new Error(`HID preflight failed for ${target.id}: keys never reached the editor. ${JSON.stringify(diag).slice(0, 1200)}`);
          }

          await mark(`${target.id}:preflightDelivered`);
          const cleaned = await cancelPreflight(pid, original);
          await mark(`${target.id}:preflightCleaned`);
          await browser.execute(() => { window.__imeLog = []; });

          // Real physical keystrokes through the HID event tap.
          const typed = jsonCall(pid, '--keys', target.keys);
          await mark(`${target.id}:keysPosted`);

          // Kotoeri live conversion ("ライブ変換") renders 日本語 as soon as the
          // romanized word is complete but deliberately KEEPS the composition
          // open for candidate confirmation — `isComposing` stays true on the
          // final insertCompositionText. Return is the key a Japanese user
          // presses to confirm; only then does a real compositionend fire.
          // A Right Arrow is not equivalent: it merely moves across conversion
          // candidates and the composition stays open forever.
          if (target.id === 'ja') {
            jsonCall(pid, '--keys', '\\r');
            await browser.pause(250);
          }

          // Wait for a genuine compositionend (never synthesize one).
          let log = [];
          try {
            await browser.waitUntil(async () => {
              log = await browser.execute(() => window.__imeLog ?? []);
              return log.some((e) => e.type === 'compositionend');
            }, { timeout: 12_000, timeoutMsg: `no real compositionend for ${target.id}` });
          } catch { /* recorded below */ }
          log = await browser.execute(() => window.__imeLog ?? []);

          const after = await docText();
          const focusAfter = await focusState();
          const types = log.map((e) => e.type);
          // Both sources are recorded so a regression is diagnosable, but the
          // committed text normally comes from the real compositionend: with a
          // proper confirm keystroke both Pinyin and Kotoeri end their
          // composition with deleteCompositionText -> insertFromComposition ->
          // compositionend.
          const composedFromEnd = log.find((e) => e.type === 'compositionend')?.data ?? null;
          const composedFromInput = [...log].reverse().find((e) => ['input', 'beforeinput'].includes(e.type) && e.data)?.data ?? '';
          const composed = composedFromEnd ?? composedFromInput;
          const hasEnd = types.includes('compositionend');

          const compositionProbe = await cmCompositionProbe();

          // One Cmd+Z should restore the exact original source. Some IMEs
          // (notably Kotoeri in auto-commit mode) split the insertion into
          // multiple editor transactions, so we allow up to 3 undos and report
          // how many were actually needed. The important thing is that the
          // original source is recoverable, not the count.
          await browser.execute(() => window.__markflowLossless?.focus?.());
          let undone = await docText();
          let undoCount = 0;
          for (let u = 0; u < 3; u += 1) {
            await browser.keys(['Meta', 'z']);
            await browser.keys(['Meta']); // release
            await browser.pause(350);
            undoCount += 1;
            undone = await docText();
            if (undone === original) break;
          }

          // Diagnostic only — NOT product evidence. Kotoeri auto-commit never
          // fires compositionend, so CodeMirror can sit in `composing` forever.
          // Ending the composition here (a synthetic DOM event) tells us
          // whether that stale state is what suppresses undo, which decides
          // between "product must finalize composition" and "history is empty".
          let forcedEndExperiment = null;
          if (undone !== original) {
            const forced = await browser.execute(() => {
              const el = document.querySelector('.cm-content');
              const view = el?.cmTile?.view ?? el?.cmView?.view ?? null;
              const snap = () => (view ? { composing: view.composing, inputState: view.inputState?.composing ?? null } : null);
              const before = snap();
              el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }));
              return { before, after: snap() };
            });
            await browser.pause(300);
            await browser.keys(['Meta', 'z']);
            await browser.keys(['Meta']);
            await browser.pause(350);
            const afterForced = await docText();
            forcedEndExperiment = { ...forced, docAfterUndo: afterForced, restored: afterForced === original };
          }

          // Typing+undo leaves the file considered dirty in this session, so a
          // later attempt to open another file pops a save-changes dialog and
          // blocks the switch. Save now to clear the dirty flag.
          await browser.keys(['Meta', 's']);
          await browser.keys(['Meta']); // release
          await browser.pause(300);
          await mark(`${target.id}:saved`);

          report.targets.push({
            id: target.id,
            label: target.label,
            inputMode: target.inputMode,
            inputSourceActive: selection.activeId,
            selection,
            keysSent: target.keys,
            activate: activated,
            activationAttempts,
            focusBefore,
            preflight: { delivered: preflightDelivered, typed: preflightTyped, eventTypes: preflightLog.map((e) => e.type) },
            preflightCleanup: cleaned,
            ax: axSnapshot(pid),
            typed,
            compositionTrace: log,
            eventTypes: types,
            focusAfter,
            hasStart: types.includes('compositionstart'),
            hasUpdate: types.includes('compositionupdate'),
            hasEnd,
            composedText: composed,
            composedFromEnd,
            composedFromInput,
            matchesExpectedScript: target.expect.test(composed),
            docAfter: after,
            docAfterUndo: undone,
            undoRestoredOriginal: undone === original,
            undoCount,
            compositionProbe,
            forcedEndExperiment,
            original,
          });
          await mark(`${target.id}:completed`);
        }
      } finally {
        // Leave the operator's input source exactly as we found it.
        if (originalSource.id) {
          const back = selectSource(originalSource.id);
          report.restoredSource = { to: originalSource.id, ok: back.ok, activeId: back.activeId };
          restored = back.ok;
        }
        await mkdir(ARTIFACT_DIR, { recursive: true });
        await writeFile(path.join(ARTIFACT_DIR, 'p4b-real-ime.json'), JSON.stringify(report, null, 2));
      }

      // Assert what actually ran FIRST, so a partial run still yields real
      // signal instead of being masked by the coverage check below.
      for (const t of report.targets) {
        // WDIO's expect takes one argument, so the identifying detail lives in
        // the value being asserted rather than a message parameter.
        expect({ check: 'inputSourceActive', id: t.id, value: t.inputSourceActive }).toEqual({ check: 'inputSourceActive', id: t.id, value: t.inputMode });
        expect({ check: 'compositionstart', id: t.id, value: t.hasStart }).toEqual({ check: 'compositionstart', id: t.id, value: true });
        expect({ check: 'compositionupdate', id: t.id, value: t.hasUpdate }).toEqual({ check: 'compositionupdate', id: t.id, value: true });
        // compositionend is required, not optional. Both Pinyin and Kotoeri
        // emit it once the composition is properly confirmed (Kotoeri live
        // conversion needs Return; see the confirm keystroke above).
        expect({ check: 'compositionend', docAfter: t.docAfter, id: t.id, value: t.hasEnd }).toEqual({ check: 'compositionend', docAfter: t.docAfter, id: t.id, value: true });
        expect({ check: 'committedIsCjk', composed: t.composedText, id: t.id, value: t.matchesExpectedScript }).toEqual({ check: 'committedIsCjk', composed: t.composedText, id: t.id, value: true });
        expect({ check: 'committedAdjacentToMarker', docAfter: t.docAfter, id: t.id, value: t.docAfter.includes(t.composedText) }).toEqual({ check: 'committedAdjacentToMarker', docAfter: t.docAfter, id: t.id, value: true });
        // "一次 Undo" is the requirement: exactly one Cmd+Z restores the exact
        // original source, and no character was lost next to the marker.
        expect({ check: 'undoRestoresOriginal', docAfterUndo: t.docAfterUndo, id: t.id, value: t.undoRestoredOriginal }).toEqual({ check: 'undoRestoresOriginal', docAfterUndo: t.docAfterUndo, id: t.id, value: true });
        expect({ check: 'undoIsSingleStep', id: t.id, undoCount: t.undoCount, value: t.undoCount === 1 }).toEqual({ check: 'undoIsSingleStep', id: t.id, undoCount: t.undoCount, value: true });
        // A composition that never ends leaves CodeMirror's
        // `ignoreDuringComposition` swallowing every real key event, so the
        // post-input state must be provably "not composing".
        expect({ check: 'notComposingAfterCommit', id: t.id, probe: t.compositionProbe, value: t.compositionProbe?.composing === false }).toEqual({ check: 'notComposingAfterCommit', id: t.id, probe: t.compositionProbe, value: true });
      }

      // Partial coverage must not read as 7.3 satisfaction.
      if (missing.length > 0) {
        throw new Error(
          'P4B 7.3 requires BOTH Chinese and Japanese real-IME runs. Missing installed input source(s): '
          + `${missing.map((m) => `${m.label} (${m.inputMode})`).join(', ')}. `
          + `Ran: ${report.targets.map((t) => t.id).join(', ') || 'none'}.`,
        );
      }

      expect({ check: 'originalInputSourceRestored', value: restored }).toEqual({ check: 'originalInputSourceRestored', value: true });
    });
  });
}

// Suite entry point (`--suite ime`). Not registered into all-lossless: the
// ordinary suites must stay runnable without an unlocked GUI session.
registerP4bRealImeTests();
