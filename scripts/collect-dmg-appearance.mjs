#!/usr/bin/env node
/**
 * 在隔离状态下采集 DMG 外观事实并断言外观契约（Issue #293）。
 *
 * 为什么需要「隔离」：macOS 会把上一个打开的 DMG 窗口的 icon view 设置（icvp）
 * 套用到下一个 DMG 窗口——这是 Finder 的窗口级状态记忆，无法从 Finder 侧关闭。
 * 如果本机还挂着别的 DMG 卷（甚至目标卷自身的残留挂载），直接 attach 会报
 * 「资源忙」，或读数混入别的窗口状态。
 *
 * 隔离序列（见 lib/dmg-appearance.mjs 的 isolateDmgMounts）：
 *   1. 卸载目标卷的既有挂载与本仓库脚本的残留挂载；其他卷只提示不动。
 *   2. 只读挂载目标 DMG。
 *   3. 复用 collectAppearance + checkAppearance 采集并断言——与 verify 脚本同一套
 *      期望值来源与判定逻辑，单一可信来源不移动。
 *   4. 立即 detach，不留残留挂载点。
 *
 * 退出码：0 = 全部断言通过；1 = 有断言失败或产物不可读。
 *
 * 用法：node scripts/collect-dmg-appearance.mjs <path/to/App.dmg> [--json <输出文件>]
 *   --json 除人类可读报告外，把实测事实 JSON 写到 <输出文件>（供回归脚本存证）。
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import {
  checkAppearance,
  collectAppearance,
  isolateDmgMounts,
  loadAppearanceConfig,
  detachDmg,
  mountDmg,
} from './lib/dmg-appearance.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function parseArgs(argv) {
  const args = { target: null, jsonOut: null }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--json') {
      args.jsonOut = argv[i + 1] ?? null
      i += 1
    } else if (args.target === null) {
      args.target = argv[i]
    }
  }
  return args
}

const args = parseArgs(process.argv.slice(2))
if (!args.target) {
  console.error('用法：node scripts/collect-dmg-appearance.mjs <path/to/App.dmg> [--json <输出文件>]')
  process.exit(1)
}

const dmgPath = resolve(args.target)
if (!existsSync(dmgPath)) {
  console.error(`FAILED: 产物不存在：${dmgPath}`)
  process.exit(1)
}

const config = loadAppearanceConfig(ROOT)

for (const notice of isolateDmgMounts(dmgPath)) console.log(notice)

let facts = null
let mountPoint = null
let collectError = null
try {
  mountPoint = mountDmg(dmgPath, { writable: false })
  facts = collectAppearance(mountPoint, config)
} catch (error) {
  collectError = error
} finally {
  if (mountPoint !== null) {
    try {
      detachDmg(mountPoint)
    } catch (error) {
      console.error(`警告：卸载失败（${String(error.message).split('\n')[0]}），可能需要手动 eject`)
    }
  }
}

if (collectError !== null) {
  console.error(`FAILED: 采集外观事实失败：${collectError.message}`)
  process.exit(1)
}

const factsForEvidence = {
  ...facts,
  // Buffer 无法 JSON 序列化，落证只保留字节数
  backgroundBytesSize: facts.backgroundBytes?.length ?? null,
  backgroundBytes: undefined,
}
delete factsForEvidence.backgroundBytes

console.log(`DMG: ${dmgPath}`)
console.log(`  窗口边界        ${facts.windowBounds ?? '(缺失)'}`)
console.log(
  `  icvp            backgroundType=${facts.backgroundType} arrangeBy=${facts.arrangeBy} ` +
    `iconSize=${facts.iconSize} textSize=${facts.textSize}`,
)
console.log(
  `  背景图          ${facts.backgroundFilePresent ? '存在' : '缺失'}` +
    `${facts.backgroundAliasSize === null ? '' : `（别名 ${facts.backgroundAliasSize} 字节）`}`,
)
for (const entry of facts.ilocsRaw) {
  console.log(`  Iloc            ${entry.name ?? '(未识别)'} → (${entry.x}, ${entry.y})`)
}

const backgroundSourceBytes = existsSync(config.backgroundSource)
  ? readFileSync(config.backgroundSource)
  : null
const problems = checkAppearance(facts, config, { backgroundSourceBytes })

if (args.jsonOut) {
  mkdirSync(dirname(resolve(args.jsonOut)), { recursive: true })
  writeFileSync(
    args.jsonOut,
    `${JSON.stringify({ dmgPath, collectedAt: new Date().toISOString(), facts: factsForEvidence, problems }, null, 2)}\n`,
  )
  console.log(`已写出外观事实：${resolve(args.jsonOut)}`)
}

if (problems.length > 0) {
  console.error(`\nFAILED: 外观契约未满足（${problems.length} 项）`)
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}

console.log('\nOK: DMG 外观符合契约（隔离采集）')
