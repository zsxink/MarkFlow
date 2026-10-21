/**
 * 发布流水线回归门禁（Issue #320）。
 *
 * v0.1.1 发布时 Windows 构建静默失败、Homebrew 拿不到草稿资产，
 * 两处都是流水线自身的 bug。这里从源码层面锁死修复方式，防止回归。
 *
 * 断言只看**代码**，不看注释：注释里正当地写着「不要这么写」的反例，
 * 直接对全文做正则会把解释文字当成违规。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8')

/** 去掉行注释与块注释，只留可执行代码。 */
const codeOnly = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line: string) => (line.trimStart().startsWith('#') ? '' : line))
    .join('\n')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('release pipeline (issue #320)', () => {
  it('tauri-cli helper 用 fileURLToPath 定位仓库根，禁止 pathname 写法', () => {
    const src = read('scripts/lib/tauri-cli.mjs')
    expect(src).toContain('fileURLToPath')
    // Windows 上 new URL(...).pathname 是 /D:/...，会被 path.resolve 拼成不存在的 \D:\...
    expect(codeOnly(src)).not.toMatch(/new URL\([^)]*\)\.pathname/)
  })

  it('调用 Tauri CLI 必须绕过 npx（Windows 上是 npx.cmd，spawnSync 执行不了）', () => {
    const src = read('scripts/lib/tauri-cli.mjs')
    expect(src).toContain('process.execPath')
    expect(codeOnly(src)).not.toMatch(/spawnSync\(\s*['"]npx/)
    // 两个入口都必须走共享 helper，不允许再出现裸 npx tauri
    for (const entry of ['scripts/tauri.mjs', 'scripts/build-dmg.mjs']) {
      const entrySrc = read(entry)
      expect(codeOnly(entrySrc)).not.toMatch(/spawnSync\(\s*['"]npx/)
      expect(entrySrc).toContain('tauri-cli.mjs')
    }
  })

  it('homebrew-publish 必须带鉴权拉资产（draft release 的公开 URL 是 404）', () => {
    const src = read('scripts/homebrew-publish.sh')
    // 只限定下载段：cask 模板里的 releases/download URL 是给终端用户用的，发布后合法。
    const downloadFn = src.match(/download_sha\(\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''
    expect(downloadFn).not.toBe('')
    expect(codeOnly(downloadFn)).not.toMatch(/releases\/download/)
    expect(downloadFn).toContain('gh release download')
    expect(downloadFn).toContain('--pattern')
  })
})
