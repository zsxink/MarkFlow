// Fixture loading for the P4A parser spike (task 6.1).
//
// The evaluation object is the LOGICAL LF text of each canonical byte fixture:
// BOM stripped, CRLF/CR normalized to LF. EOL restoration is the Core
// LineEndingMap's job (design/04) and is out of scope here. All ranges emitted
// by every candidate are UTF-16 code unit offsets into that logical text.
//
// Plain .mjs so both node scripts and vitest TS tests can import it without a
// build step. This module must never import product code.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const FIXTURE_DIR = path.join(REPO_ROOT, 'tests', 'fixtures', 'byte-contract');

/** sha256 hex of a string's UTF-8 bytes. */
export function sha256(s) {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

/**
 * Source bytes -> logical LF text (UTF-16 code units in JS string semantics).
 * Strips a UTF-8 BOM, normalizes \r\n and \r to \n.
 */
export function toLogicalText(bytes, bom) {
  let s = bytes.toString('utf8');
  if (bom === 'utf8' && s.startsWith('﻿')) s = s.slice(1);
  return s.replace(/\r\n?/g, '\n');
}

/** Load every canonical fixture from the manifest + a spike-local extra fixture. */
export async function loadFixtures() {
  const manifest = JSON.parse(await readFile(path.join(FIXTURE_DIR, 'manifest.json'), 'utf8'));
  const out = [];
  for (const fx of manifest.fixtures) {
    const bytes = await readFile(path.join(FIXTURE_DIR, fx.file));
    const logical = toLogicalText(bytes, fx.bom);
    out.push({
      id: fx.id,
      origin: 'canonical',
      manifestSha256: fx.sha256,
      byteLength: fx.byteLength,
      bom: fx.bom,
      eol: fx.eol,
      trailing: fx.trailing,
      logicalText: logical,
      logicalLength: logical.length,
      logicalSha256: sha256(logical),
    });
  }
  // One deterministic spike-local supplementary fixture (task-list checkbox,
  // nested inline emphasis, escapes, inline code, strikethrough and autolink
  // are absent from the canonical set; the P4B cohort list needs them).
  // Stored as a real file so the Rust harness reads the SAME bytes — single
  // source of truth. Synthetic, no randomness — never a user document.
  const extraPath = path.join(REPO_ROOT, 'spike', 'parser-spike', 'extra-fixtures', 'spike-extra-task-inline.md');
  const extraBuf = await readFile(extraPath);
  const extra = extraBuf.toString('utf8');
  out.push({
    id: 'spike-extra-task-inline',
    origin: 'spike-synthetic',
    manifestSha256: sha256(Buffer.from(extra, 'utf8')),
    byteLength: Buffer.byteLength(extra, 'utf8'),
    bom: 'none',
    eol: 'lf',
    trailing: 1,
    logicalText: extra,
    logicalLength: extra.length,
    logicalSha256: sha256(extra),
  });
  return out;
}
