#!/usr/bin/env node
/**
 * 把 Tauri 产出的 DMG 归一化成符合外观契约的样子。
 *
 * 为什么需要这一步：Tauri 的 DMG 打包走 create-dmg 的 `template.applescript`，模板顺序
 * 本身是对的（先切 icon view，再设 icon view options），但**实测产物里 `iconSize` 仍是
 * Finder 默认的 48、`arrangeBy` 仍是按名称排列**，只有窗口 bounds 生效。而图标尺寸与排列
 * 方式在 Tauri v2 的 DmgConfig 里根本没有对应字段，靠配置改不了。
 *
 * 所以这里绕开 Finder 自动化，直接在字节层面改产物内 `.DS_Store`：所有改写都是**等长原地
 * 覆盖**（bplist 的键与布局不变，无需重排记录表），且不引入任何需要原生编译的依赖
 * （ds-store 依赖的 macos-alias 要 node-gyp 编译、release 里没有自动编译机制，那条链路
 * 在全新 CI 环境不可靠）。背景图 alias 由构建阶段的 AppleScript 写入 `.DS_Store`，本步骤
 * 只做数值校准；若产物里没有 alias 才用 AppleScript 兜底，兜底失败则明确报错。
 *
 * 本步骤必须在 Finder/AppleScript 之后执行——它是最后一个写入者，否则 Finder 可能把改动
 * flush 掉。
 *
 * 用法：node scripts/style-dmg.mjs <path/to/App.dmg>
 */

import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  findRecords,
  ilocOwnerName,
  openPlistRecord,
  overwriteAsciiString,
  overwriteInteger,
  overwriteIloc,
  overwriteReal,
  plistDictLookup,
  readIloc,
} from './lib/ds-store.mjs'
import { detachDmg, loadAppearanceConfig, mountDmg } from './lib/dmg-appearance.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function hdiutil(args) {
  try {
    return execFileSync('hdiutil', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    const stderr = error.stderr?.toString().trim() ?? ''
    throw new Error(`hdiutil ${args.join(' ')} 失败：${stderr || error.message}`)
  }
}

function finderVolumeName(mountPoint) {
  const info = execFileSync('diskutil', ['info', mountPoint], { encoding: 'utf8' })
  const line = info.split('\n').find((entry) => entry.trimStart().startsWith('Volume Name:'))
  const name = line?.split(':').slice(1).join(':').trim()
  if (!name) throw new Error(`无法读取挂载卷名称：${mountPoint}`)
  return name
}

/**
 * AppleScript 兜底：让 Finder 把背景图写入 icon view 设置。
 * 仅在产物 .DS_Store 的 icvp 里没有 backgroundImageAlias 时调用 —— 主路径是字节级改写，
 * 这里只是给「构建阶段 AppleScript 没生成 alias」的异常产物一次补救。
 */
function setFinderBackground(mountPoint, backgroundPath) {
  const volumeName = finderVolumeName(mountPoint)
  const volumeLiteral = JSON.stringify(volumeName)
  const backgroundFileLiteral = JSON.stringify(`.background:${basename(backgroundPath)}`)
  const script = `
tell application "Finder"
  tell disk ${volumeLiteral}
    open
    delay 1
    tell container window
      set current view to icon view
    end tell
    set opts to the icon view options of container window
    set background picture of opts to file ${backgroundFileLiteral}
    close
    open
    delay 3
  end tell
end tell
`

  try {
    execFileSync('osascript', ['-e', script], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    // Finder 在 close 返回后仍可能异步 flush .DS_Store；等它写完再读取并改写。
    execFileSync('sleep', ['2'])
  } catch (error) {
    const stderr = error.stderr?.toString().trim() ?? ''
    throw new Error(`Finder 写入背景图 alias 失败：${stderr || error.message}`)
  }
}

/**
 * 在产物 .DS_Store 上做等长字节改写，校准到契约值。
 * 返回人类可读的改动清单。只做原地覆盖，不新增/删除键。
 */
function normalizeAppearance(buf, config) {
  const changes = []

  const icvpRecords = findRecords(buf, 'icvp')
  if (icvpRecords.length === 0) throw new Error('.DS_Store 内找不到 icvp 记录')
  const icvp = openPlistRecord(buf, icvpRecords[0])

  // arrangeBy 是本步骤存在的首要理由：值不是 'none' 时 Finder 会完全忽略 Iloc
  overwriteAsciiString(icvp, 'arrangeBy', 'none')
  changes.push('arrangeBy → none')

  // 2 是 Finder 的图片背景枚举值。
  overwriteInteger(icvp, 'backgroundType', 2)
  changes.push('backgroundType → image')

  overwriteReal(icvp, 'iconSize', config.iconSize)
  changes.push(`iconSize → ${config.iconSize}`)

  if (plistDictLookup(icvp, 'textSize') !== null) {
    overwriteReal(icvp, 'textSize', config.textSize)
    changes.push(`textSize → ${config.textSize}`)
  }

  const ilocRecords = findRecords(buf, 'Iloc')
  const byName = new Map()
  for (const record of ilocRecords) {
    const name = ilocOwnerName(buf, record, [config.appName, config.applicationsName])
    if (name !== null && !byName.has(name)) byName.set(name, record)
  }

  for (const [name, position] of [
    [config.appName, config.appPosition],
    [config.applicationsName, config.applicationFolderPosition],
  ]) {
    const record = byName.get(name)
    if (!record) {
      throw new Error(
        `找不到 ${name} 的 Iloc 记录（现有条目：${[...byName.keys()].join(', ') || '无'}）`,
      )
    }
    const before = readIloc(buf, record)
    overwriteIloc(buf, record, position.x, position.y)
    changes.push(`${name} (${before.x}, ${before.y}) → (${position.x}, ${position.y})`)
  }

  return changes
}

/** icvp 里是否已有背景图 alias。有就说明构建阶段已生成背景引用，无需 Finder 兜底。 */
function hasBackgroundAlias(buf) {
  const icvpRecords = findRecords(buf, 'icvp')
  if (icvpRecords.length === 0) return false
  const icvp = openPlistRecord(buf, icvpRecords[0])
  const alias = plistDictLookup(icvp, 'backgroundImageAlias')
  return alias !== null && alias.value.kind === 'data' && alias.value.value > 0
}

const target = process.argv[2]
if (!target) {
  console.error('用法：node scripts/style-dmg.mjs <path/to/App.dmg>')
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

const workDir = mkdtempSync(join(tmpdir(), 'markflow-style-'))
const rwDmg = join(workDir, 'rw.dmg')
let mountPoint = null

try {
  // 只读镜像改不了，先转成可写
  hdiutil(['convert', dmgPath, '-format', 'UDRW', '-o', rwDmg])
  mountPoint = mountDmg(rwDmg, { writable: true, nobrowse: false, automatic: true })

  // ---- 1. 背景图兜底：构建阶段 .background/ 可能是空的 ----
  const sourceBytes = readFileSync(config.backgroundSource)
  const backgroundDir = join(mountPoint, '.background')
  const backgroundTarget = join(backgroundDir, config.backgroundFileName)
  mkdirSync(backgroundDir, { recursive: true })
  const backgroundSynced =
    existsSync(backgroundTarget) && readFileSync(backgroundTarget).equals(sourceBytes)
  if (!backgroundSynced) copyFileSync(config.backgroundSource, backgroundTarget)

  const dsPath = join(mountPoint, '.DS_Store')
  if (!existsSync(dsPath)) {
    throw new Error(
      '产物内没有 .DS_Store：图标视图设置无从改写。这通常意味着构建阶段的 AppleScript 未执行，' +
        '需要回到构建阶段解决，而不是在这里猜。',
    )
  }

  // ---- 2. 若产物没有背景 alias，用 AppleScript 兜底生成；有则跳过（主路径，不依赖 Finder）----
  let buf = readFileSync(dsPath)
  const changes = []
  if (!backgroundSynced) changes.push(`.background/${config.backgroundFileName} 已重新同步`)
  if (!hasBackgroundAlias(buf)) {
    setFinderBackground(mountPoint, backgroundTarget)
    changes.push('backgroundImageAlias → Finder 图片背景（AppleScript 兜底）')
    buf = readFileSync(dsPath)
  }

  // ---- 3. .DS_Store 数值校准（等长字节改写） ----
  changes.push(...normalizeAppearance(buf, config))
  writeFileSync(dsPath, buf)

  detachDmg(mountPoint)
  mountPoint = null

  // ---- 4. 重新压成只读镜像并替换原文件 ----
  const finalDmg = join(workDir, 'final.dmg')
  hdiutil(['convert', rwDmg, '-format', 'UDZO', '-o', finalDmg])
  copyFileSync(finalDmg, dmgPath)

  console.log(`OK: 已归一化 ${dmgPath}`)
  for (const change of changes) console.log(`  - ${change}`)
} catch (error) {
  console.error(`FAILED: ${error.message}`)
  process.exitCode = 1
} finally {
  if (mountPoint !== null) {
    try {
      detachDmg(mountPoint)
    } catch {
      /* 清理失败不影响结论 */
    }
  }
  rmSync(workDir, { recursive: true, force: true })
}