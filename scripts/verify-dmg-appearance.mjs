#!/usr/bin/env node
/**
 * 只读校验 DMG 产物是否符合外观契约。
 *
 * 断言的是**发出去的那个文件本身**，而不是打包日志或脚本里的坐标——打包流程「跑完了」
 * 和「外观对了」是两件事，这个仓库已经吃过一次亏（AppleScript 正常返回，但 iconSize 与
 * arrangeBy 都没落地）。
 *
 * 期望值来源见 lib/dmg-appearance.mjs 的说明：坐标与窗口尺寸来自 tauri.conf.json，
 * 图标与文字尺寸来自 dmg-appearance.json。
 *
 * 用法：node scripts/verify-dmg-appearance.mjs <path/to/App.dmg>
 * 退出码：0 = 全部断言通过；1 = 有断言失败或产物不可读
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  checkAppearance,
  collectAppearance,
  loadAppearanceConfig,
  withDmgMounted,
} from './lib/dmg-appearance.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const target = process.argv[2]
if (!target) {
  console.error('用法：node scripts/verify-dmg-appearance.mjs <path/to/App.dmg>')
  process.exit(1)
}

const dmgPath = resolve(target)
if (!existsSync(dmgPath)) {
  console.error(`FAILED: 产物不存在：${dmgPath}`)
  process.exit(1)
}

const config = loadAppearanceConfig(ROOT)
if (!existsSync(config.backgroundSource)) {
  console.error(`FAILED: 背景图导出物不存在：${config.backgroundSource}`)
  console.error('先执行：node scripts/build-dmg-background.mjs')
  process.exit(1)
}
const backgroundSourceBytes = readFileSync(config.backgroundSource)

const facts = withDmgMounted(dmgPath, { writable: false }, (mountPoint) =>
  collectAppearance(mountPoint, config),
)
const problems = checkAppearance(facts, config, { backgroundSourceBytes })

console.log(`DMG: ${dmgPath}`)
console.log(`  窗口边界        ${facts.windowBounds ?? '(缺失)'}`)
console.log(
  `  icvp            backgroundType=${facts.backgroundType} arrangeBy=${facts.arrangeBy} ` +
    `iconSize=${facts.iconSize} textSize=${facts.textSize}`,
)
console.log(`  背景图          ${facts.backgroundFilePresent ? '存在' : '缺失'}${facts.backgroundAliasSize === null ? '' : `（别名 ${facts.backgroundAliasSize} 字节）`}`)
for (const entry of facts.ilocsRaw) {
  console.log(`  Iloc            ${entry.name ?? '(未识别)'} → (${entry.x}, ${entry.y})`)
}

if (problems.length > 0) {
  console.error(`\nFAILED: 外观契约未满足（${problems.length} 项）`)
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}

console.log('\nOK: DMG 外观符合契约')
