#!/usr/bin/env node
/**
 * 构建 macOS DMG，并立即把 Finder 外观写回产物。
 *
 * Tauri 能把背景文件复制进 DMG，但不会稳定落地 icon view 的图片背景配置；
 * 因此本地构建也必须复用发布流水线的 style + verify 步骤。
 */

import { readdirSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dmgDir = join(ROOT, 'src-tauri', 'target', 'release', 'bundle', 'dmg')

if (process.platform !== 'darwin') {
  console.error('FAILED: DMG 只能在 macOS 上构建')
  process.exit(1)
}

const build = spawnSync('npx', ['tauri', 'build', '--bundles', 'dmg'], {
  cwd: ROOT,
  stdio: 'inherit',
})
if (build.status !== 0) process.exit(build.status ?? 1)

if (!existsSync(dmgDir)) {
  console.error(`FAILED: DMG 输出目录不存在：${dmgDir}`)
  process.exit(1)
}

const dmgs = readdirSync(dmgDir)
  .filter((name) => name.endsWith('.dmg'))
  .map((name) => join(dmgDir, name))

if (dmgs.length === 0) {
  console.error(`FAILED: ${dmgDir} 中没有 DMG 产物`)
  process.exit(1)
}

for (const dmg of dmgs) {
  for (const script of ['style-dmg.mjs', 'verify-dmg-appearance.mjs']) {
    const result = spawnSync(process.execPath, [join(ROOT, 'scripts', script), dmg], {
      cwd: ROOT,
      stdio: 'inherit',
    })
    if (result.status !== 0) process.exit(result.status ?? 1)
  }
}
