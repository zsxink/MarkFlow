/**
 * 构建脚本的公共入口：定位仓库根目录，并调用本地安装的 Tauri CLI。
 *
 * 两条踩过的坑，别凭印象改回去（Issue #320）：
 *   - 根目录不能用 `new URL('../', import.meta.url).pathname`。Windows 上 pathname 是
 *     `/D:/a/MarkFlow/MarkFlow/`，win32 的 path.resolve 会把它拼成 `\D:\a\MarkFlow\MarkFlow`
 *     ——一个不存在的路径。spawnSync 拿着无效 cwd 直接失败且**没有任何输出**，
 *     v0.1.1 的 Windows 构建就是这么静默挂掉的。
 *   - 不能用 `npx` 调 CLI。Windows 上它是一个 `npx.cmd`，spawnSync 不带 shell 时无法执行；
 *     直接用 `process.execPath` 跑 `@tauri-apps/cli` 的 Node 入口则处处可用。
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

const TAURI_CLI = join(ROOT, 'node_modules', '@tauri-apps', 'cli', 'tauri.js')

/**
 * 执行 `tauri <args>`，stdio 透传。返回进程退出码。
 */
export function runTauri(args) {
  if (!existsSync(TAURI_CLI)) {
    throw new Error(`找不到 Tauri CLI：${TAURI_CLI}（先执行 npm ci）`)
  }

  const result = spawnSync(process.execPath, [TAURI_CLI, ...args], {
    cwd: ROOT,
    stdio: 'inherit',
  })

  if (result.error) throw result.error
  return result.status ?? 1
}
