#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { ROOT, runTauri } from './lib/tauri-cli.mjs'

const args = process.argv.slice(2)

const status = runTauri(args)
if (status !== 0) process.exit(status)

// Tauri 的原始 build 不会应用 DMG 的 Finder 外观；把后处理挂到同一个入口，
// 这样 `npm run tauri build` 和 CI 使用的 DMG 都走同一套归一化与校验。
if (process.platform !== 'darwin' || args[0] !== 'build') process.exit(0)

const bundlesArgIndex = args.indexOf('--bundles')
if (bundlesArgIndex !== -1) {
  const bundles = args[bundlesArgIndex + 1] ?? ''
  if (!bundles.split(',').includes('dmg')) process.exit(0)
}

const dmgDir = join(ROOT, 'src-tauri', 'target', 'release', 'bundle', 'dmg')
if (!existsSync(dmgDir)) process.exit(0)

const dmgs = readdirSync(dmgDir)
  .filter((name) => name.endsWith('.dmg'))
  .map((name) => join(dmgDir, name))

for (const dmg of dmgs) {
  for (const script of ['style-dmg.mjs', 'collect-dmg-appearance.mjs']) {
    const result = spawnSync(process.execPath, [join(ROOT, 'scripts', script), dmg], {
      cwd: ROOT,
      stdio: 'inherit',
    })
    if (result.status !== 0) process.exit(result.status ?? 1)
  }
}
