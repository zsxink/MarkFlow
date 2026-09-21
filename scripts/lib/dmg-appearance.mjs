/**
 * DMG 安装窗口外观的共享逻辑：读配置、挂载镜像、采集实测事实、按契约断言。
 *
 * 归一化脚本（style-dmg.mjs）与断言脚本（verify-dmg-appearance.mjs）共用这里，
 * 保证「写进去的」和「读回来验的」是同一套解析代码 —— 否则等于自己给自己出题。
 *
 * 期望值来源分两处，都有明确理由：
 *   - windowSize / appPosition / applicationFolderPosition / background ⇒ tauri.conf.json
 *     （Tauri 自己就认这份，脚本不能另存一份坐标）
 *   - iconSize / textSize ⇒ src-tauri/dmg-appearance.json
 *     （Tauri v2 的 DmgConfig 没有这两个字段，写进 tauri.conf.json 会被 schema 拒绝）
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'

import { findRecords, ilocOwnerName, openPlistRecord, plistDictEntries, readIloc } from './ds-store.mjs'

const BACKGROUND_DIR = '.background'
const APPLICATIONS_NAME = 'Applications'
const CLEANUP_MOUNT_POINTS = new Set()

export function loadAppearanceConfig(rootDir) {
  const confPath = join(rootDir, 'src-tauri', 'tauri.conf.json')
  const conf = JSON.parse(readFileSync(confPath, 'utf8'))
  const dmg = conf.bundle?.macOS?.dmg

  if (!dmg) {
    throw new Error(
      'tauri.conf.json 缺少 bundle.macOS.dmg：外观参数必须显式声明，否则上游改默认值会让背景图构图静默错位',
    )
  }
  for (const key of ['background', 'windowSize', 'appPosition', 'applicationFolderPosition']) {
    if (!dmg[key]) throw new Error(`tauri.conf.json 的 bundle.macOS.dmg 缺少 ${key}`)
  }

  const appearancePath = join(rootDir, 'src-tauri', 'dmg-appearance.json')
  const appearance = JSON.parse(readFileSync(appearancePath, 'utf8'))
  for (const key of ['iconSize', 'textSize']) {
    if (typeof appearance[key] !== 'number') throw new Error(`dmg-appearance.json 缺少数值型 ${key}`)
  }

  return {
    productName: conf.productName,
    appName: `${conf.productName}.app`,
    applicationsName: APPLICATIONS_NAME,
    windowSize: dmg.windowSize,
    appPosition: dmg.appPosition,
    applicationFolderPosition: dmg.applicationFolderPosition,
    // bundle.macOS.dmg.background 的路径相对 tauri.conf.json 所在目录
    backgroundSource: resolve(join(rootDir, 'src-tauri'), dmg.background),
    backgroundFileName: basename(dmg.background),
    iconSize: appearance.iconSize,
    textSize: appearance.textSize,
  }
}

function hdiutil(args) {
  try {
    return execFileSync('hdiutil', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    const stderr = error.stderr?.toString().trim() ?? ''
    throw new Error(`hdiutil ${args.join(' ')} 失败：${stderr || error.message}`)
  }
}

export function mountDmg(
  dmgPath,
  { writable = false, nobrowse = true, mountPoint: requestedMountPoint = null, automatic = false } = {},
) {
  const mountPoint = automatic
    ? null
    : (requestedMountPoint ?? mkdtempSync(join(tmpdir(), 'markflow-dmg-')))
  if (mountPoint !== null && requestedMountPoint !== null) {
    if (existsSync(mountPoint)) throw new Error(`挂载点已存在，请先 eject：${mountPoint}`)
    mkdirSync(mountPoint, { recursive: true })
    CLEANUP_MOUNT_POINTS.add(mountPoint)
  }
  const args = ['attach', writable ? '-readwrite' : '-readonly']
  if (nobrowse) args.push('-nobrowse')
  if (mountPoint !== null) args.push('-mountpoint', mountPoint)
  args.push(dmgPath)
  try {
    const output = hdiutil(args)
    if (automatic) {
      const mountedPath = output
        .split('\n')
        .map((line) => line.match(/(\/Volumes\/.*)$/)?.[1])
        .find(Boolean)
      if (!mountedPath) throw new Error(`hdiutil 未返回标准挂载路径：${output}`)
      return mountedPath
    }
  } catch (error) {
    if (mountPoint !== null && (CLEANUP_MOUNT_POINTS.delete(mountPoint) || requestedMountPoint === null)) {
      rmSync(mountPoint, { recursive: true, force: true })
    }
    throw error
  }
  return mountPoint
}

export function detachDmg(mountPoint) {
  let lastError
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      hdiutil(['detach', mountPoint])
      if (CLEANUP_MOUNT_POINTS.delete(mountPoint) || mountPoint.includes('/markflow-dmg-')) {
        rmSync(mountPoint, { recursive: true, force: true })
      }
      return
    } catch (error) {
      lastError = error
      execFileSync('sleep', ['1'])
    }
  }
  throw lastError
}

export function withDmgMounted(dmgPath, options, fn) {
  const mountPoint = mountDmg(dmgPath, options)
  try {
    return fn(mountPoint)
  } finally {
    detachDmg(mountPoint)
  }
}

/** 只读采集产物当前的外观事实。不做任何判定，只报告「实际是什么」。 */
export function collectAppearance(mountPoint, config) {
  const facts = {
    hasDsStore: false,
    backgroundFilePresent: false,
    backgroundBytes: null,
    backgroundType: null,
    backgroundAliasSize: null,
    arrangeBy: null,
    iconSize: null,
    textSize: null,
    windowBounds: null,
    ilocs: {},
    ilocsRaw: [],
  }

  const backgroundPath = join(mountPoint, BACKGROUND_DIR, config.backgroundFileName)
  if (existsSync(backgroundPath)) {
    facts.backgroundFilePresent = true
    facts.backgroundBytes = readFileSync(backgroundPath)
  }

  const dsPath = join(mountPoint, '.DS_Store')
  if (!existsSync(dsPath)) return facts
  facts.hasDsStore = true

  const buf = readFileSync(dsPath)

  const icvpRecords = findRecords(buf, 'icvp')
  if (icvpRecords.length > 0) {
    const entries = plistDictEntries(openPlistRecord(buf, icvpRecords[0]))
    facts.arrangeBy = typeof entries.arrangeBy === 'string' ? entries.arrangeBy : null
    facts.iconSize = typeof entries.iconSize === 'number' ? entries.iconSize : null
    facts.textSize = typeof entries.textSize === 'number' ? entries.textSize : null
    facts.backgroundType = typeof entries.backgroundType === 'number' ? entries.backgroundType : null
    facts.backgroundAliasSize = typeof entries.backgroundImageAlias === 'number' ? entries.backgroundImageAlias : null
  }

  const bwspRecords = findRecords(buf, 'bwsp')
  if (bwspRecords.length > 0) {
    const entries = plistDictEntries(openPlistRecord(buf, bwspRecords[0]))
    facts.windowBounds = typeof entries.WindowBounds === 'string' ? entries.WindowBounds : null
  }

  for (const record of findRecords(buf, 'Iloc')) {
    const name = ilocOwnerName(buf, record, [config.appName, config.applicationsName])
    const { x, y } = readIloc(buf, record)
    facts.ilocsRaw.push({ name, x, y })
    if (name !== null) facts.ilocs[name] = { x, y }
  }

  return facts
}

export function parseWindowBounds(raw) {
  if (typeof raw !== 'string') return null
  const match = raw.match(/\{\{\s*(-?\d+)\s*,\s*(-?\d+)\s*\}\s*,\s*\{\s*(\d+)\s*,\s*(\d+)\s*\}\}/)
  if (!match) return null
  return { x: Number(match[1]), y: Number(match[2]), width: Number(match[3]), height: Number(match[4]) }
}

/**
 * 按外观契约逐项比对，返回人类可读的问题列表。空数组表示全部通过。
 * 每条问题都写成「实测 vs 期望」，让失败时不必再回头翻配置。
 */
export function checkAppearance(facts, config, { backgroundSourceBytes = null } = {}) {
  const problems = []

  if (!facts.hasDsStore) {
    problems.push('卷内没有 .DS_Store —— 没有任何图标视图设置落地')
  }

  if (!facts.backgroundFilePresent) {
    problems.push(`卷内缺少背景图 ${BACKGROUND_DIR}/${config.backgroundFileName}`)
  } else if (backgroundSourceBytes !== null && !facts.backgroundBytes.equals(backgroundSourceBytes)) {
    problems.push('卷内背景图与设计源导出物字节不一致 —— 重新执行背景图生成命令')
  }

  if (facts.backgroundType === null) {
    problems.push('icvp 缺少 backgroundType')
  } else if (facts.backgroundType === 0) {
    problems.push('backgroundType=0：窗口仍是纯色背景，背景图没有被引用')
  }

  if (facts.arrangeBy === null) {
    problems.push('icvp 缺少 arrangeBy')
  } else if (facts.arrangeBy !== 'none') {
    problems.push(
      `arrangeBy="${facts.arrangeBy}"：Finder 会忽略图标坐标并按名称重排，背景图箭头将指向空处`,
    )
  }

  if (facts.iconSize === null) {
    problems.push('icvp 缺少 iconSize')
  } else if (facts.iconSize !== config.iconSize) {
    problems.push(`iconSize=${facts.iconSize}，期望 ${config.iconSize}`)
  }

  const expectedPositions = [
    [config.appName, config.appPosition],
    [config.applicationsName, config.applicationFolderPosition],
  ]
  for (const [name, expected] of expectedPositions) {
    const actual = facts.ilocs[name]
    if (!actual) {
      problems.push(`找不到 ${name} 的图标坐标记录（Iloc）`)
      continue
    }
    if (actual.x !== expected.x || actual.y !== expected.y) {
      problems.push(`${name} 坐标 (${actual.x}, ${actual.y})，期望 (${expected.x}, ${expected.y})`)
    }
  }

  const bounds = parseWindowBounds(facts.windowBounds)
  if (bounds === null) {
    problems.push(`无法解析 bwsp.WindowBounds：${facts.windowBounds ?? '(缺失)'}`)
  } else if (bounds.width !== config.windowSize.width || bounds.height !== config.windowSize.height) {
    problems.push(
      `窗口 ${bounds.width}×${bounds.height}，期望 ${config.windowSize.width}×${config.windowSize.height}`,
    )
  }

  return problems
}
