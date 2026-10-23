/**
 * 发布流水线回归门禁（Issue #320、#374）。
 *
 * v0.1.1 发布时 Windows 构建静默失败、Homebrew 拿不到草稿资产，
 * 两处都是流水线自身的 bug。这里从源码层面锁死修复方式，防止回归。
 * #374 再补一组：Release 产物矩阵必须覆盖 Intel macOS（x86_64 DMG），
 * 交叉编译传参、target 域产物路径、架构自检、双架构下载说明全部锁死。
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

describe('release pipeline (issue #374: Intel macOS x86_64 包)', () => {
  it('build matrix 必须同时覆盖 macOS aarch64 与 x86_64 两个条目', () => {
    const src = codeOnly(read('.github/workflows/release.yml'))
    // 两条目都跑在 macos-latest（arm64 runner）上，x86_64 靠交叉编译产出
    expect(src).toMatch(/platform: macos-latest\s*\r?\n\s*rust_target: aarch64-apple-darwin/)
    expect(src).toMatch(/platform: macos-latest\s*\r?\n\s*rust_target: x86_64-apple-darwin/)
  })

  it('macOS 构建必须显式传 --target，Windows/Linux 保持不传', () => {
    const src = codeOnly(read('.github/workflows/release.yml'))
    // tauri-action 的 args 按 platform 条件派生：x86_64 交叉编译必需；
    // arm job 一并传让产物路径统一为 target 域。Windows/Linux 传了反而扰动原生构建与缓存键。
    expect(src).toMatch(
      /args: \$\{\{ matrix\.platform == 'macos-latest' && format\('--target \{0\}', matrix\.rust_target\) \|\| '' \}\}/,
    )
  })

  it('构建后必须对 .app 主二进制跑 lipo 架构自检（期望值由 matrix 派生）', () => {
    const src = codeOnly(read('.github/workflows/release.yml'))
    expect(src).toContain('lipo -info')
    // --target 传递失效会让 x86_64 job 静默产出 arm64 包，架构断言是最低门槛
    expect(src).toMatch(/matrix\.rust_target == 'aarch64-apple-darwin' && 'arm64' \|\| 'x86_64'/)
  })

  it('DMG 外观三步的 glob 必须落在 target/<rust_target> 域', () => {
    const src = codeOnly(read('.github/workflows/release.yml'))
    const scoped = src.match(
      /src-tauri\/target\/\$\{\{ matrix\.rust_target \}\}\/release\/bundle\/dmg\/\*\.dmg/g,
    )
    expect(scoped?.length).toBe(3)
    // 旧的非 target 域路径不允许回归：传 --target 后那里没有产物，循环会静默跳过
    expect(src).not.toMatch(/src-tauri\/target\/release\/bundle\//)
  })

  it('releaseBody 下载说明必须区分 Apple Silicon 与 Intel', () => {
    const src = codeOnly(read('.github/workflows/release.yml'))
    expect(src).toMatch(/macOS \(Apple Silicon\)[^\n]*_aarch64\.dmg/)
    expect(src).toMatch(/macOS \(Intel\)[^\n]*_x86_64\.dmg/)
  })

  it('homebrew-publish 仍须保留 on_intel 段与 x86_64 资产名（cask 双架构靠它）', () => {
    const src = codeOnly(read('scripts/homebrew-publish.sh'))
    expect(src).toContain('on_intel do')
    expect(src).toContain('MarkFlow_#{version}_x86_64.dmg')
    expect(src).toContain('download_sha "x86_64"')
  })
})
