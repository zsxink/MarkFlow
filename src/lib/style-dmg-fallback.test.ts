import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const styleScript = readFileSync(resolve(process.cwd(), 'scripts/style-dmg.mjs'), 'utf8')
const finderScript = styleScript.match(/const script = `([\s\S]*?)`/)?.[1] ?? ''
const fallbackBlock = styleScript.match(/if \(!hasBackgroundAlias\(buf\)\) \{([\s\S]*?)\n  \}/)?.[1] ?? ''

describe('DMG Finder background fallback', () => {
  it('closes the Finder volume window after persisting the background alias', () => {
    expect(finderScript).toMatch(/set background picture[^\n]*\n\s+close\s*\n\s+end tell/)
    expect(finderScript.match(/\bopen\b/g)).toHaveLength(1)
  })

  it('flushes Finder writes before normalizing the .DS_Store bytes', () => {
    expect(fallbackBlock).toMatch(/setFinderBackground[\s\S]*detachDmg\(mountPoint\)[\s\S]*mountDmg\(rwDmg/)
  })
})
