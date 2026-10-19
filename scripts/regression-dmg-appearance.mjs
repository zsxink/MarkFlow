#!/usr/bin/env node
/**
 * 一轮化 DMG 外观回归验证（Issue #293）。
 *
 * 背景：v0.1.0 的发布产物出自外观修复合入**之前**的 tag——「仓库里有门禁」和
 * 「用户下载到的产物经过门禁」是两件事。这个脚本把归一化、断言、证据三步串成
 * 一轮，让发布前对最终产物做一次完整走查有单条命令可依赖。
 *
 * 一轮内容：
 *   1. 归一化（style-dmg.mjs）：字节级等长改写 .DS_Store，不依赖 Finder。
 *   2. 隔离断言（collect-dmg-appearance.mjs）：清场 → 只读挂载 → 采集事实 →
 *      立即卸载 → 按契约断言，规避 Finder 的跨 DMG 窗口状态记忆。
 *   3. 存证：断言通过后，挂载产物并让 Finder 打开窗口，抓一张屏幕截图存入
 *      evidence/dmg-<slug>.png；随后卸载。截图失败只降级为警告，不掩盖断言结果。
 *
 * 用法：node scripts/regression-dmg-appearance.mjs <path/to/App.dmg> [--label <slug>]
 * 退出码：0 = 全部通过；1 = 有断言失败或产物不可读。
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { mountDmg, detachDmg } from './lib/dmg-appearance.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPTS = resolve(ROOT, 'scripts')
const EVIDENCE = resolve(ROOT, 'evidence')

function runScript(script, args, { optional = false } = {}) {
  const result = spawnSync(process.execPath, [join(SCRIPTS, script), ...args], {
    cwd: ROOT,
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    if (optional) {
      console.log(`注意：${script} 未成功（退出码 ${result.status}），按可选步骤继续`)
      return false
    }
    process.exit(result.status ?? 1)
  }
  return true
}

function parseArgs(argv) {
  const args = { target: null, label: null }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--label') {
      args.label = argv[i + 1] ?? null
      i += 1
    } else if (args.target === null) {
      args.target = argv[i]
    }
  }
  return args
}

const args = parseArgs(process.argv.slice(2))
if (!args.target) {
  console.error('用法：node scripts/regression-dmg-appearance.mjs <path/to/App.dmg> [--label <slug>]')
  process.exit(1)
}

const dmgPath = resolve(args.target)
if (!existsSync(dmgPath)) {
  console.error(`FAILED: 产物不存在：${dmgPath}`)
  process.exit(1)
}

// 证据目录名：优先 --label，否则取产物文件名去扩展名
const slug = args.label ?? basename(dmgPath).replace(/\.dmg$/i, '').replace(/[^a-zA-Z0-9._-]+/g, '-')
const evidenceDir = join(EVIDENCE, `dmg-${slug}`)

// ---- 1. 归一化 ----
console.log('== 步骤 1/3：归一化（style） ==')
runScript('style-dmg.mjs', [dmgPath])

// ---- 2. 隔离断言 + 外观事实 JSON ----
console.log('\n== 步骤 2/3：隔离断言（collect + check） ==')
mkdirSync(evidenceDir, { recursive: true })
runScript('collect-dmg-appearance.mjs', [dmgPath, '--json', join(evidenceDir, 'appearance-facts.json')])

// ---- 3. 截图证据 ----
console.log('\n== 步骤 3/3：Finder 截图证据 ==')
try {
  const workDir = mkdtempSync(join(tmpdir(), 'markflow-evidence-'))
  const mountPoint = join(workDir, 'm')
  try {
    mountDmg(dmgPath, { writable: false, mountPoint, automatic: false })
    // 读卷名：Finder 打开后的窗口标题即卷名； nobrowse 会抑制 Finder 窗口自动弹出，
    // 因此这里显式用 open 打开（目录场景下 open 的效果与肉眼双击一致）
    const diskutilInfo = execFileSync('diskutil', ['info', mountPoint], { encoding: 'utf8' })
    const volumeName = diskutilInfo
      .split('\n')
      .find((line) => line.trimStart().startsWith('Volume Name:'))
      ?.split(':')
      .slice(1)
      .join(':')
      .trim()
    if (!volumeName) throw new Error(`无法读取挂载卷名称：${mountPoint}`)
    console.log(`已挂载 ${mountPoint}（卷名 ${volumeName}），用 Finder 打开……`)
    // Finder 打开挂载的 DMG 窗口
    execFileSync('open', [mountPoint], { stdio: 'ignore' })
    // 等待 Finder 渲染窗口内容（首次挂载可能有延迟）
    execFileSync('sleep', ['3'])
    const screenshotPath = join(evidenceDir, 'finder-window.png')
    // 确認窗口真的弹出来了（Issue #293 教训：卷挂上 ≠ 窗口在屏）
    const volumeLiteral = JSON.stringify(volumeName)
    const listed = execFileSync(
      'osascript',
      ['-e', `tell application "Finder" to get name of every window`],
      { encoding: 'utf8' },
    )
    if (!listed.split(', ').includes(volumeName)) {
      throw new Error(`Finder 未打开卷窗口（当前窗口：${listed.trim()}）——检查自动弹出设置`)
    }
    // 先按窗口 ID 抓 DMG 窗口本身；找不到窗口时回退整屏（仍含已打开的窗口）
    let windowId = null
    try {
      const script = `
        tell application "Finder" to activate
        delay 1
        tell application "System Events"
          tell process "Finder"
            repeat with w in windows
              if name of w is ${volumeLiteral} then return id of w
            end repeat
          end tell
        end tell`
      const output = execFileSync('osascript', ['-e', script], { encoding: 'utf8' }).trim()
      windowId = /^\d+$/.test(output) ? output : null
    } catch {
      windowId = null
    }
    const captureArgs = windowId ? ['-x', '-o', `-l${windowId}`, screenshotPath] : ['-x', screenshotPath]
    execFileSync('screencapture', captureArgs, { stdio: ['ignore', 'pipe', 'pipe'] })
    const bytes = readFileSync(screenshotPath)
    if (bytes.length === 0) throw new Error('截图为空（0 字节）')
    writeFileSync(
      join(evidenceDir, 'screenshot-meta.json'),
      `${JSON.stringify(
        {
          dmgPath,
          volumeName,
          capturedVia: windowId ? `window:${windowId}` : 'fullscreen-fallback',
          capturedAt: new Date().toISOString(),
          screenshotBytes: bytes.length,
        },
        null,
        2,
      )}\n`,
    )
    console.log(
      `OK: 截图已存档 ${screenshotPath}（${bytes.length} 字节，${windowId ? `窗口 ${windowId}` : '整屏回退'}）`,
    )
  } finally {
    // 关闭 Finder 里打开的 DMG 窗口再卸载，避免卸载时窗口占用
    try {
      execFileSync(
        'osascript',
        ['-e', 'tell application "Finder" to close every window whose name is "MarkFlow"'],
        { stdio: 'ignore' },
      )
    } catch {
      /* 关闭失败不影响卸载尝试 */
    }
    try {
      detachDmg(mountPoint)
    } catch (error) {
      console.error(`警告：卸载失败（${String(error.message).split('\n')[0]}），请手动 eject ${mountPoint}`)
    }
    rmSync(workDir, { recursive: true, force: true })
  }
} catch (error) {
  console.log(`警告：截图存证未完成：${String(error.message).split('\n')[0]}`)
  console.log('断言结论不受影响——外观事实 JSON 才是判定依据。')
}

console.log(`\nOK: 一轮回归完成，证据目录 ${evidenceDir}/`)
console.log('  - appearance-facts.json  外观实测事实')
console.log('  - finder-window.png      打开产物时的 Finder 截图')
console.log('  - screenshot-meta.json   截图元数据')
