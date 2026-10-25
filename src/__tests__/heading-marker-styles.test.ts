/**
 * 标题级别标记样式契约（change: wysiwyg-heading-level-marker）。
 *
 * 标记是纯 CSS 伪元素，TS 侧没有任何可断言的行为，渲染结果只能靠样式规则本身
 * 防回归。这里直读 `src/styles/editor.css` 断言两条关键约束：
 *
 * 1. 标记只作用于顶层标题（`.ProseMirror > h1`~`> h6`）：嵌套在引用块/列表项里的
 *    标题左侧没有留白，绝对定位的标记会压在引用边线或项目符号上。
 * 2. 空标题占位符（Tiptap 给首个空块加 `is-editor-empty`）必须复位标记泄漏的
 *    定位与字体属性，否则「开始写作 — 输入即所得」会被搬到标题左侧留白并被裁切。
 *
 * 断言只看样式规则本身（注释先剥离），注释里可以自由写反例说明。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

type Rule = { selectors: string[]; declarations: Record<string, string> }

const CSS_PATH = 'src/styles/editor.css'
const LEVELS = [1, 2, 3, 4, 5, 6]
const PLACEHOLDER = '.ProseMirror .is-editor-empty:first-child::before'

const readCss = () => readFileSync(resolve(process.cwd(), CSS_PATH), 'utf8')

/** 折叠空白、去掉 combinator 两侧空格，便于选择器比对。 */
const normalizeSelector = (selector: string) =>
  selector
    .replace(/\s+/g, ' ')
    .replace(/\s*([>+~])\s*/g, '$1')
    .trim()

function parseRules(css: string): Rule[] {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const rules: Rule[] = []
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g
  let match = rulePattern.exec(stripped)
  while (match) {
    const selectors = match[1]
      .split(',')
      .map((selector) => normalizeSelector(selector))
      .filter(Boolean)
    const declarations: Record<string, string> = {}
    for (const declaration of match[2].split(';')) {
      const separator = declaration.indexOf(':')
      if (separator === -1) continue
      declarations[declaration.slice(0, separator).trim()] = declaration.slice(separator + 1).trim()
    }
    rules.push({ selectors, declarations })
    match = rulePattern.exec(stripped)
  }
  return rules
}

const rules = parseRules(readCss())

/** 取某个选择器上某条声明的生效值（同选择器多条规则时后者覆盖前者）。 */
function declaration(selector: string, property: string): string | undefined {
  const target = normalizeSelector(selector)
  const values = rules
    .filter((rule) => rule.selectors.includes(target))
    .map((rule) => rule.declarations[property])
    .filter((value): value is string => value !== undefined)
  return values[values.length - 1]
}

const markerSelector = (level: number) => `.ProseMirror > h${level}::before`

describe('标题级别标记样式契约', () => {
  it('六级顶层标题各有一条标记规则，且级别文字与标签名一致', () => {
    for (const level of LEVELS) {
      expect(declaration(markerSelector(level), 'content'), `h${level} 标记 content 缺失`).toBe(`"H${level}"`)
    }
  })

  it('标记绝对定位到标题左侧留白并垂直居中，不占正文版式宽度', () => {
    for (const level of LEVELS) {
      expect(declaration(markerSelector(level), 'position'), `h${level} position`).toBe('absolute')
      expect(declaration(markerSelector(level), 'right'), `h${level} right`).toBe('calc(100% + 10px)')
      // h1 有底边线 padding，需补偿才能对齐文字行而非整个盒子。
      expect(declaration(markerSelector(level), 'top'), `h${level} top`)
        .toBe(level === 1 ? 'calc(50% - 5px)' : '50%')
      expect(declaration(markerSelector(level), 'transform'), `h${level} transform`).toBe('translateY(-50%)')
      // 标记不得进入选区/指针交互。
      expect(declaration(markerSelector(level), 'pointer-events'), `h${level} pointer-events`).toBe('none')
      expect(declaration(markerSelector(level), 'user-select'), `h${level} user-select`).toBe('none')
      // 颜色只允许主题 token，硬编码色在明暗切换后会失效。
      expect(declaration(markerSelector(level), 'color'), `h${level} color`).toBe('var(--muted)')
    }
  })

  it('标记只作用于文档直接子级标题，嵌套标题（引用块/列表项内）不外溢', () => {
    const markerSelectors = rules
      .filter((rule) => rule.selectors.some((selector) => selector.includes('::before')))
      .flatMap((rule) => rule.selectors)
      .filter((selector) => /h[1-6]/.test(selector))
    // 反例：裸 `.ProseMirror h2::before` 会命中 `> # 标题` / `- # 标题` 里的嵌套标题。
    expect(markerSelectors).not.toContain(normalizeSelector('.ProseMirror h2::before'))
    for (const level of LEVELS) {
      expect(markerSelectors).toContain(normalizeSelector(markerSelector(level)))
    }
  })

  it('空标题占位符复位标记泄漏的定位与字体属性', () => {
    // Tiptap Placeholder 给首个空块输出 `<h1 class="is-empty is-editor-empty" ...>`，
    // 同时命中标记规则；不复位就会被绝对定位搬到标题左侧留白并被容器裁切。
    expect(declaration(PLACEHOLDER, 'position')).toBe('static')
    expect(declaration(PLACEHOLDER, 'right')).toBe('auto')
    expect(declaration(PLACEHOLDER, 'top')).toBe('auto')
    expect(declaration(PLACEHOLDER, 'transform')).toBe('none')
    expect(declaration(PLACEHOLDER, 'font')).toBe('inherit')
    expect(declaration(PLACEHOLDER, 'letter-spacing')).toBe('normal')
    // 占位符本身的既有契约不受影响。
    expect(declaration(PLACEHOLDER, 'content')).toBe('attr(data-placeholder)')
  })
})
