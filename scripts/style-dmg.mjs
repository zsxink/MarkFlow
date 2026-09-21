#!/usr/bin/env node
/**
 * 把 Tauri 产出的 DMG 归一化成符合外观契约的样子。
 *
 * 为什么需要这一步：Tauri 的 DMG 打包走 create-dmg 的 `template.applescript`，模板顺序
 * 本身是对的（先切 icon view，再设 icon view options），但**实测产物里 `iconSize` 仍是
 * Finder 默认的 48、`arrangeBy` 仍是按名称排列**，只有窗口 bounds 生效。而图标尺寸与排列
 * 方式在 Tauri v2 的 DmgConfig 里根本没有对应字段，靠配置改不了。
 *
 * 所以这里绕开 Finder 自动化，直接在字节层面改产物内 `.DS_Store`。好处是确定、可离线校验，
 * 且不依赖 CI 上是否有 GUI 会话。本步骤必须在 Finder/AppleScript 之后执行——它是最后一个
 * 写入者，否则 Finder 可能把改动 flush 掉。
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
import { createRequire } from 'node:module'

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
const require = createRequire(import.meta.url)
const DsStore = require('ds-store')

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
    // Finder 在 close 返回后仍可能异步 flush .DS_Store；等它写完再读取并改写，
    // 否则后面的字节级修改会把刚生成的 backgroundImageAlias 覆盖掉。
    execFileSync('sleep', ['2'])
  } catch (error) {
    const stderr = error.stderr?.toString().trim() ?? ''
    throw new Error(`Finder 写入背景图 alias 失败：${stderr || error.message}`)
  }
}

function writeDsStore(dsPath, backgroundPath, config) {
  const store = new DsStore()
  store.setBackgroundPath(backgroundPath)
  store.setIconSize(config.iconSize)
  store.setIconPos(config.appName, config.appPosition.x, config.appPosition.y)
  store.setIconPos(
    config.applicationsName,
    config.applicationFolderPosition.x,
    config.applicationFolderPosition.y,
  )
  store.setWindowPos(10, 522)
  // ds-store 的 API 会为标题栏预留 22pt，这里传入内容区高度以得到配置中的窗口高度。
  store.setWindowSize(config.windowSize.width, config.windowSize.height - 22)

  return new Promise((resolveWrite, rejectWrite) => {
    store.write(dsPath, (error) => (error ? rejectWrite(error) : resolveWrite()))
  })
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
  // Finder 外观由 DS_Store 生成器写入，挂载点不要求固定路径。
  // 用系统标准 /Volumes 挂载路径生成 alias，Finder 重新打开 DMG 时才能解析背景图。
  mountPoint = mountDmg(rwDmg, { writable: true, nobrowse: false, automatic: true })

  // ---- 1. 背景图兜底：AppleScript 段整体没跑成功时 .background/ 会是空的 ----
  const sourceBytes = readFileSync(config.backgroundSource)
  const backgroundDir = join(mountPoint, '.background')
  const backgroundTarget = join(backgroundDir, config.backgroundFileName)
  mkdirSync(backgroundDir, { recursive: true })
  const backgroundSynced =
    existsSync(backgroundTarget) && readFileSync(backgroundTarget).equals(sourceBytes)
  if (!backgroundSynced) copyFileSync(config.backgroundSource, backgroundTarget)

  // ---- 2. .DS_Store 归一化 ----
  const dsPath = join(mountPoint, '.DS_Store')
  if (!existsSync(dsPath)) {
    throw new Error(
      '产物内没有 .DS_Store：图标视图设置无从改写。这通常意味着构建阶段的 AppleScript 未执行，' +
        '需要回到构建阶段解决，而不是在这里猜。',
    )
  }

  // 直接生成包含 macOS Alias 的 icvp，避免不同 Finder 版本对 AppleScript 的兼容差异。
  await writeDsStore(dsPath, backgroundTarget, config)
  const buf = readFileSync(dsPath)
  const changes = []
  if (!backgroundSynced) changes.push(`.background/${config.backgroundFileName} 已重新同步`)
  changes.push('backgroundImageAlias → Finder 图片背景')

  const icvpRecords = findRecords(buf, 'icvp')
  if (icvpRecords.length === 0) throw new Error('.DS_Store 内找不到 icvp 记录')
  const icvp = openPlistRecord(buf, icvpRecords[0])

  // arrangeBy 是本步骤存在的首要理由：值不是 'none' 时 Finder 会完全忽略 Iloc
  overwriteAsciiString(icvp, 'arrangeBy', 'none')
  changes.push('arrangeBy → none')

  // 2 是 Finder 的图片背景枚举值；Alias 已由 ds-store 生成。
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

  writeFileSync(dsPath, buf)

  detachDmg(mountPoint)
  mountPoint = null

  // ---- 3. 重新压成只读镜像并替换原文件 ----
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
