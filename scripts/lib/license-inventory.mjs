/**
 * License inventory derivation shared by `generate-license-inventory.mjs`
 * and `check-license-inventory.mjs`.
 *
 * Everything here is derived from the lockfiles so the inventory cannot drift
 * from what actually ships:
 *
 *   npm   -> `package-lock.json` (production entries) + `node_modules/<pkg>/`
 *   cargo -> `cargo metadata` dependency tree + each crate's manifest dir
 *
 * Zero runtime dependencies, and no network access: `cargo metadata` is always
 * invoked with `--offline` so a missing registry cache fails loudly instead of
 * silently reaching out to crates.io.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

/**
 * License identifiers the project is willing to ship under. Anything outside
 * this set fails the gate on purpose: an unknown identifier is exactly the
 * moment a human has to look at the dependency before it goes into a release.
 *
 * Grouped by the obligation they impose, so a reviewer can see at a glance
 * which entries need a bundled text file.
 */
export const ALLOWED_LICENSES = new Map([
  // Permissive, attribution only.
  ['MIT', 'permissive: keep copyright + license notice'],
  ['ISC', 'permissive: keep copyright + license notice'],
  ['BSD-2-Clause', 'permissive: keep copyright + license notice'],
  ['BSD-3-Clause', 'permissive: keep copyright + license notice, no endorsement'],
  ['Apache-2.0', 'permissive: keep license + NOTICE, state changes'],
  ['Zlib', 'permissive: keep notice, no misrepresentation'],
  ['Unlicense', 'public domain dedication'],
  ['CC0-1.0', 'public domain dedication'],
  ['0BSD', 'permissive: no attribution required'],
  ['MIT-0', 'permissive: no attribution required'],
  ['BSL-1.0', 'permissive: keep license notice'],
  ['BlueOak-1.0.0', 'permissive: keep license notice'],
  ['Python-2.0', 'permissive: keep license notice'],
  ['Unicode-3.0', 'permissive: keep copyright + license notice'],
  ['CDLA-Permissive-2.0', 'permissive: keep copyright + license notice'],
  // Weak copyleft, satisfied by shipping the license text unmodified.
  ['MPL-2.0', 'weak copyleft: file-level; ship text, keep sources reachable'],
  // Exception that rides along with Apache-2.0 (LLVM toolchain crates).
  ['LLVM-exception', 'Apache-2.0 exception: ship exception text'],
  // Bundled fonts.
  ['OFL-1.1', 'font license: ship text, honour reserved font names'],
]);

/**
 * Preference order for `OR` choices. Picking deterministically keeps the
 * snapshot stable across runs and keeps the project on permissive terms even
 * when upstream also offers a copyleft branch.
 *
 * Notably this avoids `LGPL-2.1-or-later` (offered by `r-efi`) and the
 * `LLVM-exception` form (offered by the `windows*` crates) wherever the plain
 * alternative is available.
 */
export const LICENSE_PREFERENCE = [
  'MIT',
  'Apache-2.0',
  'ISC',
  'BSD-3-Clause',
  'BSD-2-Clause',
  'Zlib',
  'CC0-1.0',
  'Unlicense',
  '0BSD',
  'MIT-0',
  'BSL-1.0',
  'BlueOak-1.0.0',
  'Python-2.0',
  'CDLA-Permissive-2.0',
  'Unicode-3.0',
  'MPL-2.0',
];

/** License file names seen in the wild, in the order we prefer to read them. */
const LICENSE_FILE_NAMES = [
  'LICENSE',
  'LICENSE.md',
  'LICENSE.txt',
  'LICENSE.markdown',
  'license',
  'license.md',
  'LICENCE',
  'LICENSE-MIT',
  'LICENSE_MIT',
  'LICENSE-APACHE',
  'LICENSE_APACHE-2.0',
  'LICENSE-CC0',
  'LICENSE-BOOST',
  'COPYING',
  'COPYING.txt',
  // Tauri plugins ship an SPDX document instead of a plain license file.
  'LICENSE.spdx',
];

/** Sniff an SPDX id out of a license file when metadata carries none. */
const SNIFF_RULES = [
  [/MIT License|Permission is hereby granted, free of charge/i, 'MIT'],
  [/Apache License\s*\n?\s*Version 2\.0/i, 'Apache-2.0'],
  [/ISC License/i, 'ISC'],
  [/Redistribution and use in source and binary forms/i, 'BSD-3-Clause'],
  [/SIL OPEN FONT LICENSE/i, 'OFL-1.1'],
  [/Mozilla Public License Version 2\.0/i, 'MPL-2.0'],
  [/Creative Commons Zero|CC0 1\.0/i, 'CC0-1.0'],
  [/This is free and unencumbered software released into the public domain/i, 'Unlicense'],
];

// ── SPDX expression handling ────────────────────────────────────────────────

/**
 * Normalise the shorthand that older Cargo manifests and npm packages use into
 * real SPDX. `/` and ` / ` are non-SPDX aliases for `OR`, which is what they
 * meant in every manifest this repo actually depends on.
 */
export function normalizeSpdx(expression) {
  return String(expression ?? '')
    .replace(/\s*\/\s*/g, ' OR ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tokenise an SPDX expression into identifiers, `AND`, `OR`, `WITH`, parens. */
function tokenize(expression) {
  const tokens = [];
  const re = /\(|\)|[A-Za-z0-9.+-]+/g;
  let match;
  while ((match = re.exec(expression))) tokens.push(match[0]);
  return tokens;
}

/**
 * Parse an SPDX expression into a small AST.
 *
 * Grammar (precedence low -> high): orExpr := andExpr (OR andExpr)*,
 * andExpr := primary (AND primary)*, primary := '(' orExpr ')' | ident [WITH ident].
 */
function parse(expression) {
  const tokens = tokenize(expression);
  let i = 0;
  const peek = () => tokens[i];
  const eat = (expected) => {
    if (expected !== undefined && tokens[i] !== expected) {
      throw new Error(`expected ${expected} at ${i} in "${expression}"`);
    }
    return tokens[i++];
  };

  const parsePrimary = () => {
    if (peek() === '(') {
      eat('(');
      const node = parseOr();
      eat(')');
      return node;
    }
    const id = eat();
    if (id === undefined) throw new Error(`unexpected end of "${expression}"`);
    if (peek() === 'WITH') {
      eat('WITH');
      return { type: 'with', license: id, exception: eat() };
    }
    return { type: 'id', id };
  };

  const parseAnd = () => {
    let node = parsePrimary();
    while (peek() === 'AND') {
      eat('AND');
      node = { type: 'and', left: node, right: parsePrimary() };
    }
    return node;
  };

  const parseOr = () => {
    let node = parseAnd();
    while (peek() === 'OR') {
      eat('OR');
      node = { type: 'or', left: node, right: parseAnd() };
    }
    return node;
  };

  const ast = parseOr();
  if (i !== tokens.length) {
    throw new Error(`trailing tokens in "${expression}": ${tokens.slice(i).join(' ')}`);
  }
  return ast;
}

/** Rank a single identifier by preference; unknown ids rank last. */
function rank(id) {
  const index = LICENSE_PREFERENCE.indexOf(id);
  return index === -1 ? LICENSE_PREFERENCE.length : index;
}

function rankOf(node) {
  if (node.type === 'id') return rank(node.id);
  if (node.type === 'with') return rank(node.license);
  // An AND group is only as good as its most restrictive operand.
  return Math.max(rankOf(node.left), rankOf(node.right));
}

/** Collapse `OR` branches to the project's chosen branch; keep `AND` intact. */
function resolve(ast) {
  if (ast.type === 'id') return { type: 'id', id: ast.id };
  if (ast.type === 'with') {
    return { type: 'with', license: ast.license, exception: ast.exception };
  }
  if (ast.type === 'and') {
    return { type: 'and', left: resolve(ast.left), right: resolve(ast.right) };
  }
  // or
  const left = resolve(ast.left);
  const right = resolve(ast.right);
  return rankOf(left) <= rankOf(right) ? left : right;
}

function formatAst(ast) {
  if (ast.type === 'id') return ast.id;
  if (ast.type === 'with') return `${ast.license} WITH ${ast.exception}`;
  return `${formatAst(ast.left)} ${ast.type.toUpperCase()} ${formatAst(ast.right)}`;
}

function collectIds(ast, into = new Set()) {
  if (ast.type === 'id') into.add(ast.id);
  else if (ast.type === 'with') {
    into.add(ast.license);
    into.add(ast.exception);
  } else {
    collectIds(ast.left, into);
    collectIds(ast.right, into);
  }
  return into;
}

/**
 * Turn a raw license declaration into the two fields the inventory records:
 * `license` (verbatim upstream expression) and `chosen` (what the project
 * actually relies on), plus the text files that must ship alongside it.
 */
export function resolveLicense(rawExpression) {
  const license = normalizeSpdx(rawExpression);
  if (!license) throw new Error('missing license expression');
  const resolved = resolve(parse(license));
  return {
    license,
    chosen: formatAst(resolved),
    texts: [...collectIds(resolved)].sort(),
  };
}

// ── Copyright line extraction ───────────────────────────────────────────────

const COPYRIGHT_LINE_RE =
  /^\s*(?:\/\*|#|\*|;|--)?\s*(copyright\b[^\n]*|\(c\)[^\n]*)/i;

/**
 * Copyright notice of a bundled license file.
 *
 * Only the attribution *header* counts. License bodies are full of sentences
 * like "copyright notice that is included in or attached to the work" (Apache's
 * definition of "Submit") or "copyright in it" (BlueOak's template); matching
 * those would invent an attribution that does not exist. So the search stops
 * after the first few lines and requires a year or the © sign.
 */
export function extractCopyright(text) {
  const source = String(text);
  // SPDX documents carry the notice in a structured field instead of prose.
  const spdx = /^PackageCopyrightText:\s*(.+)$/m.exec(source);
  if (spdx) return spdx[1].trim();

  const headerLines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 6);
  for (const line of headerLines) {
    const match = COPYRIGHT_LINE_RE.exec(line);
    if (!match) continue;
    const value = match[1].replace(/[\s*]+$/, '').trim();
    // Require a year or © so we only take a real notice, not a heading such as
    // "COPYRIGHT AND PERMISSION NOTICE".
    if (/\d{4}|©/.test(value)) return value;
  }
  return '';
}

/**
 * Pick the license file that matches the license actually chosen.
 *
 * Packages that ship `LICENSE_MIT` alongside `LICENSE_APACHE-2.0` must be read
 * from the file for the branch the project relies on, not from whichever file
 * happens to sort first.
 */
function readFirstLicenseFile(dir, preferredId) {
  if (!existsSync(dir)) return null;
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  const read = (name) => {
    try {
      return { name, text: readFileSync(join(dir, name), 'utf8') };
    } catch {
      return null;
    }
  };

  if (preferredId) {
    // Only trust a name match when the file actually contains that license: a
    // name like `LICENSE-MIT` on a dual-licensed package is the right hint, but
    // fuzzy matches would not be.
    const wanted = preferredId.toLowerCase().replace(/[^a-z0-9]/g, '');
    const named = entries
      .filter((name) => /^(licen[cs]e|copying)/i.test(name))
      .filter((name) => name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(wanted));
    for (const name of named) {
      const file = read(name);
      if (file && sniffLicense(file.text) === preferredId) return file;
    }
  }

  const byLower = new Map(entries.map((name) => [name.toLowerCase(), name]));
  for (const candidate of LICENSE_FILE_NAMES) {
    const actual = byLower.get(candidate.toLowerCase());
    if (!actual) continue;
    const file = read(actual);
    if (file) return file;
  }
  // Fall back to any file whose name starts with "license"/"licence"/"copying".
  const loose = entries.find((name) => /^(licen[cs]e|copying)/i.test(name));
  return loose ? read(loose) : null;
}

function sniffLicense(text) {
  for (const [pattern, id] of SNIFF_RULES) {
    if (pattern.test(text)) return id;
  }
  return null;
}

// ── npm inventory ──────────────────────────────────────────────────────────

/**
 * Production npm dependencies, straight from `package-lock.json`.
 *
 * The lockfile omits `license` for a handful of packages; for those we fall
 * back to the package manifest and then to sniffing the bundled license text,
 * so nothing is silently dropped.
 */
export function readNpmInventory(root) {
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
  const entries = [];

  for (const [path, meta] of Object.entries(lock.packages ?? {})) {
    if (!path.startsWith('node_modules/')) continue;
    if (meta.dev || meta.link) continue;

    const name = meta.name ?? path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
    const dir = join(root, path);

    let rawLicense = meta.license ?? null;
    let licenseSource = rawLicense ? 'lockfile' : null;

    if (!rawLicense) {
      const manifestPath = join(dir, 'package.json');
      if (existsSync(manifestPath)) {
        try {
          const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
          rawLicense = manifest.license ?? null;
          if (rawLicense) licenseSource = 'package.json';
        } catch {
          // A broken manifest should not hide the dependency.
        }
      }
    }

    // Resolve first: dual-licensed packages ship one license file per branch, so
    // the file we read must be the one for the branch we actually rely on.
    const resolved = rawLicense ? resolveLicense(rawLicense) : null;
    const licenseFile = readFirstLicenseFile(dir, resolved?.chosen);

    if (!rawLicense && licenseFile) {
      rawLicense = sniffLicense(licenseFile.text);
      if (rawLicense) licenseSource = `license-file:${licenseFile.name}`;
    }

    const finalResolved = rawLicense
      ? resolved ?? resolveLicense(rawLicense)
      : { license: 'UNKNOWN', chosen: 'UNKNOWN', texts: [] };

    const record = {
      ecosystem: 'npm',
      name,
      version: meta.version,
      ...finalResolved,
      licenseSource: licenseSource ?? 'none',
      copyright: licenseFile ? extractCopyright(licenseFile.text) : '',
    };
    entries.push(record);
  }

  return entries.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}

// ── cargo inventory ────────────────────────────────────────────────────────

/**
 * Reachable crates of the workspace, derived from `cargo metadata`.
 *
 * `--all-features` matters: it pulls the optional `e2e`-feature crates
 * (`tauri-plugin-wdio*`) into the tree, which is what makes the reachable set
 * match `Cargo.lock` exactly. `--offline` keeps the generator honest about
 * never reaching the network.
 */
export function readCargoInventory(root, { offline = true } = {}) {
  const manifest = join(root, 'src-tauri', 'Cargo.toml');
  const args = ['metadata', '--manifest-path', manifest, '--format-version', '1', '--all-features'];
  if (offline) args.push('--offline');

  let stdout;
  try {
    stdout = execFileSync('cargo', args, {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const detail = String(error.stderr ?? error.message).trim();
    throw new Error(
      `cargo metadata failed (offline mode). Run "cargo fetch --manifest-path src-tauri/Cargo.toml" once to populate the registry cache, then retry.\n${detail}`,
    );
  }

  const metadata = JSON.parse(stdout);
  const byId = new Map(metadata.packages.map((pkg) => [pkg.id, pkg]));
  const graph = new Map(metadata.resolve.nodes.map((node) => [node.id, node.dependencies]));
  const members = new Set(metadata.workspace_members);

  const reachable = new Set();
  const stack = [...members];
  while (stack.length) {
    const id = stack.pop();
    if (reachable.has(id)) continue;
    reachable.add(id);
    for (const dep of graph.get(id) ?? []) stack.push(dep);
  }

  const entries = [];
  for (const id of reachable) {
    const pkg = byId.get(id);
    if (!pkg || members.has(id)) continue; // skip the workspace crate itself

    const dir = pkg.manifest_path.replace(/[/\\]Cargo\.toml$/, '');
    const licenseFile = readFirstLicenseFile(dir);
    const rawLicense = pkg.license ?? (pkg.license_file ? 'UNKNOWN' : null);

    entries.push({
      ecosystem: 'cargo',
      name: pkg.name,
      version: pkg.version,
      ...(rawLicense
        ? resolveLicense(rawLicense)
        : { license: 'UNKNOWN', chosen: 'UNKNOWN', texts: [] }),
      licenseSource: pkg.license
        ? 'Cargo.toml'
        : pkg.license_file
          ? `license_file:${pkg.license_file}`
          : licenseFile
            ? `license-file:${licenseFile.name}`
            : 'none',
      // Most Rust crates ship the MIT template without a copyright line, so
      // fall back to the manifest's `authors` for attribution.
      copyright: licenseFile
        ? extractCopyright(licenseFile.text) || (pkg.authors ?? []).join('; ')
        : (pkg.authors ?? []).join('; '),
    });
  }

  return entries.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}

// ── Snapshot + rendered notices ────────────────────────────────────────────

export const SNAPSHOT_HEADER = {
  npm: 'Generated from package-lock.json by scripts/generate-license-inventory.mjs. Do not edit by hand.',
  cargo:
    'Generated from `cargo metadata --all-features` by scripts/generate-license-inventory.mjs. Do not edit by hand.',
};

/** Stable JSON so the freshness check can diff the file byte-for-byte. */
export function serializeSnapshot(ecosystem, entries) {
  const payload = {
    ecosystem,
    note: SNAPSHOT_HEADER[ecosystem],
    count: entries.length,
    packages: entries,
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

/** License ids that must have a text file under `third-party/texts/`. */
export function requiredTextIds(entries) {
  const ids = new Set();
  for (const entry of entries) {
    for (const id of entry.texts) ids.add(id);
  }
  return [...ids].sort();
}

function renderGroup(entries) {
  const lines = [];
  for (const entry of entries) {
    const suffix = entry.copyright ? ` — ${entry.copyright}` : '';
    lines.push(`- \`${entry.name}@${entry.version}\`${suffix}`);
  }
  return lines;
}

/**
 * Upstream expressions whose alternatives include something the project does
 * *not* want (copyleft, or an exception form). These are the rows a reviewer
 * actually has to look at; the ~390 `MIT OR Apache-2.0` rows all resolve to MIT
 * and would only bury the interesting cases.
 */
const SAFE_BRANCHES = new Set([
  'MIT',
  'Apache-2.0',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Zlib',
  'CC0-1.0',
  'Unlicense',
  '0BSD',
  'MIT-0',
  'BSL-1.0',
  'BlueOak-1.0.0',
  'Python-2.0',
  'CDLA-Permissive-2.0',
  'Unicode-3.0',
]);

function offersUnsafeBranch(entry) {
  const ids = [...entry.license.matchAll(/[A-Za-z0-9.+-]+/g)]
    .map((match) => match[0])
    .filter((token) => !['OR', 'AND', 'WITH'].includes(token));
  return ids.some((id) => !SAFE_BRANCHES.has(id));
}

/**
 * Human-readable notices, grouped by the chosen license expression so a reader
 * can answer "what do I owe for this group?" in one glance.
 *
 * `extraTextIds` covers licenses that are not visible in either lockfile —
 * notably OFL-1.1 for the bundled fonts.
 */
export function renderNotices({ npmEntries, cargoEntries, generatedAt, extraTextIds = [] }) {
  const all = [...npmEntries, ...cargoEntries];
  const groups = new Map();
  for (const entry of all) {
    const key = entry.chosen;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }

  const notableChoices = all.filter(
    (entry) => entry.license !== entry.chosen && offersUnsafeBranch(entry),
  );
  const textIds = [...new Set([...requiredTextIds(all), ...extraTextIds])].sort();

  const out = [];
  out.push('# Third-Party Notices');
  out.push('');
  out.push(
    'MarkFlow bundles third-party software. This file is generated — do not edit it by hand.',
  );
  out.push('');
  out.push('## How to read this file');
  out.push('');
  out.push(`- \`license\` is the expression declared upstream, verbatim.`);
  out.push(
    '- \`chosen\` is the branch MarkFlow relies on. For dual- or multi-licensed packages the project takes the permissive branch listed below.',
  );
  out.push(
    '- License texts are shipped in `third-party/texts/` (and inside the installed app under its resources directory).',
  );
  out.push(`- Entries: ${all.length} (npm ${npmEntries.length}, Rust ${cargoEntries.length}).`);
  out.push(`- Generated: ${generatedAt}`);
  out.push('');

  out.push('## License texts shipped with this project');
  out.push('');
  for (const id of textIds) out.push(`- \`${id}\` → \`third-party/texts/${id}.txt\``);
  out.push('');

  if (notableChoices.length) {
    out.push('## Notable license choices');
    out.push('');
    out.push(
      'Upstream offers a choice that includes a copyleft or exception branch. MarkFlow uses the `chosen` branch, which is the permissive one.',
    );
    out.push('');
    out.push('| Package | Version | Upstream expression | Chosen |');
    out.push('| --- | --- | --- | --- |');
    for (const entry of notableChoices) {
      out.push(`| \`${entry.name}\` | ${entry.version} | \`${entry.license}\` | \`${entry.chosen}\` |`);
    }
    out.push('');
  }

  out.push('## Packages by chosen license');
  out.push('');
  for (const key of [...groups.keys()].sort()) {
    const entries = groups.get(key);
    out.push(`### ${key} (${entries.length})`);
    out.push('');
    for (const line of renderGroup(entries)) out.push(line);
    out.push('');
  }

  return `${out.join('\n').replace(/\n+$/, '')}\n`;
}
