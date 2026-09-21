#!/usr/bin/env node
/**
 * 由设计源 `assets/dmg-background.svg` 生成打包用的背景图。
 *
 * 只在人工更新设计源后运行。打包与断言路径都直接读这张 PNG，因此**不依赖 sharp**——
 * CI 的 ubuntu 与 macos runner 都不需要装图像库。
 *
 * 输出尺寸强制等于 tauri.conf.json 的 `bundle.macOS.dmg.windowSize`：Finder 的
 * background picture 不做 DPI 缩放，图与窗口尺寸必须 1:1，否则只会显示一角。
 */

import { readFile, mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = resolve(ROOT, 'assets/dmg-background.svg')
const OUTPUT = resolve(ROOT, 'src-tauri/assets/dmg-background.png')
const CONFIG = JSON.parse(await readFile(join(ROOT, 'src-tauri', 'tauri.conf.json'), 'utf8'))

const windowSize = CONFIG.bundle?.macOS?.dmg?.windowSize
if (!windowSize) {
  console.error('FAILED: tauri.conf.json 缺少 bundle.macOS.dmg.windowSize')
  process.exit(1)
}

const { width, height } = windowSize
const svg = await readFile(SOURCE)

await mkdir(dirname(OUTPUT), { recursive: true })
const info = await sharp(svg, { density: 72 })
  .resize(width, height)
  .png({ compressionLevel: 9 })
  .toFile(OUTPUT)

if (info.width !== width || info.height !== height) {
  console.error(`FAILED: 生成尺寸 ${info.width}×${info.height}，期望 ${width}×${height}`)
  process.exit(1)
}

console.log(`OK: ${OUTPUT} (${info.width}×${info.height}, ${info.size} bytes)`)
