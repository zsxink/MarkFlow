/**
 * 任务列表样式契约（change: task-list-checkbox-caret-spacing）。
 *
 * 三个缺陷都出在 CSS 层：复选框沿用浏览器默认尺寸、空任务项内容区宽度为 0
 * 导致 WebKit 不绘制插入光标、任务项内部段落下边距与列表项下边距叠加使任务项
 * 间距大于段落间距。TypeScript 与 Markdown 往返测试都覆盖不到这类问题，因此
 * 这里直接读取 `src/styles/editor.css` 断言关键声明与其数值关系，作为快速
 * 防回归门禁。渲染结果由 `e2e/specs/smoke/task-list.e2e.mjs` 的几何实测覆盖。
 *
 * 断言只看样式规则本身（注释先剥离），注释里可以自由写反例说明。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

type Rule = { selectors: string[]; declarations: Record<string, string> }

const CSS_PATH = 'src/styles/editor.css'

/** Tiptap NodeView 渲染出的结构：li > label(contentEditable=false) > input + span，然后是内容 div。 */
const CHECKBOX = '.ProseMirror ul[data-type="taskList"] li input[type="checkbox"]'
const CONTENT = '.ProseMirror ul[data-type="taskList"] li > div'
const ITEM = '.ProseMirror ul[data-type="taskList"] li'
const ITEM_PARAGRAPH = '.ProseMirror ul[data-type="taskList"] li > div > p'
const ITEM_PARAGRAPH_FOLLOWING = '.ProseMirror ul[data-type="taskList"] li > div > p + p'
const NESTED_LIST = '.ProseMirror ul[data-type="taskList"] li > div > ul[data-type="taskList"]'

const readCss = () => readFileSync(resolve(process.cwd(), CSS_PATH), 'utf8')

/** 折叠空白、去掉 combinator 两侧空格，便于选择器比对。 */
const normalizeSelector = (selector: string) =>
  selector
    .replace(/\s+/g, ' ')
    .replace(/\s*([>+~])\s*/g, '$1')
    .trim()

/** 把选择器拆成 combinator 分隔的复合选择器序列（`>`/`+`/`~`/空格都是 combinator）。 */
const compounds = (selector: string) => normalizeSelector(selector).split(/[>+~]|\s+/).filter(Boolean)

/** 解析末位复合选择器：类型选择器 + 限定符（属性/class/id/伪类）。 */
function parseCompound(compound: string): { element: string | null; qualifiers: string[] } {
  const element = /^[a-zA-Z][\w-]*/.exec(compound)?.[0]?.toLowerCase() ?? null
  const qualifiers = compound.slice(element?.length ?? 0).match(/\[[^\]]*\]|[.#][\w-]+|::?[\w-]+(?:\([^)]*\))?/g) ?? []
  return { element, qualifiers }
}

/**
 * 末位复合选择器是否「只圈定裸 ul/ol」——也就是会不会连带命中任务列表外的
 * 普通项目符号/有序列表。末位必须显式带 `[data-type="taskList"]`（或 class/id）
 * 才算收窄到任务列表，否则一个 `li > div > ul` 会同时改掉任务项里嵌套的普通列表的
 * 下边距。这是对解析后的复合选择器做结构判断，不是整条选择器的子串匹配。
 */
function endsWithPlainList(selector: string): boolean {
  const parts = compounds(selector)
  if (parts.length === 0) return false
  const { element, qualifiers } = parseCompound(parts[parts.length - 1])
  if (element !== 'ul' && element !== 'ol') return false
  const scopedByDataAttr = qualifiers.some((qualifier) =>
    /^\[\s*data-type\s*=\s*["']?taskList["']?\s*\]$/i.test(qualifier))
  const scopedByClassOrId = qualifiers.some((qualifier) => qualifier.startsWith('.') || qualifier.startsWith('#'))
  return !scopedByDataAttr && !scopedByClassOrId
}

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

/** 把 `1em` / `0.35em` 解析成数字；非 em 单位直接失败，防止有人改回 px。 */
function emValue(value: string | undefined, label: string): number {
  expect(value, `${label} 缺失`).toBeDefined()
  const parsed = /^(\d*\.?\d+)em$/.exec(String(value))
  expect(parsed, `${label} 必须使用 em 单位（实际 ${value}）`).not.toBeNull()
  return Number(parsed![1])
}

describe('任务列表样式契约', () => {
  it('复选框是 1em 的可视尺寸且在 flex 布局中不被压缩', () => {
    expect(emValue(declaration(CHECKBOX, 'width'), '复选框 width')).toBe(1)
    expect(emValue(declaration(CHECKBOX, 'height'), '复选框 height')).toBe(1)
    expect(declaration(CHECKBOX, 'flex')).toBe('none')
    expect(declaration(CHECKBOX, 'accent-color')).toBe('var(--accent)')
    // 表单控件默认不继承字体，不写 inherit 时 1em 走 UA 默认字号（13px），
    // 复选框会小于正文字号且不随设置缩放。
    expect(declaration(CHECKBOX, 'font-size')).toBe('inherit')
  })

  it('复选框按行高做垂直居中偏移（行高 1.7em 下略高于 1em 方块的一半留白）', () => {
    const marginTop = emValue(declaration(CHECKBOX, 'margin-top'), '复选框 margin-top')
    // (1.7 - 1) / 2 = 0.35em：太小会顶到行顶，太大会掉到下一行。
    expect(marginTop).toBeGreaterThan(0.2)
    expect(marginTop).toBeLessThan(0.5)
  })

  it('任务项内容区用 flex: 1 1 0 保证空内容时宽度仍大于零', () => {
    expect(declaration(CONTENT, 'flex')).toBe('1 1 0')
    expect(declaration(CONTENT, 'min-width')).toBe('0')
  })

  it('任务项内部段落不再叠加段落下边距，多段落保留 0.4em 间隔', () => {
    expect(declaration(ITEM_PARAGRAPH, 'margin')).toBe('0')
    expect(emValue(declaration(ITEM_PARAGRAPH_FOLLOWING, 'margin-top'), '任务项内 p + p margin-top')).toBeCloseTo(0.4)
  })

  it('嵌套列表规则只命中嵌套的任务列表，不会外溢到任务项里的普通列表', () => {
    // 结构检查（先做，失败时报的就是泄漏本身）：任何「任务列表范围内」的规则，
    // 末位复合选择器都不能是裸 `ul`/`ol`。裸 `ul` 会连带命中任务项里嵌套的普通
    // 项目符号/有序列表（实测其下边距从 `.ProseMirror ul` 的 1em 被压成 0.25em），
    // 违反「任务列表样式不外溢」。
    const unscopedTaskListSelectors = rules.flatMap((rule) => rule.selectors
      .filter((selector) => selector.includes('data-type="taskList"'))
      .filter(endsWithPlainList))
    expect(unscopedTaskListSelectors).toEqual([])

    // 修正后的规则必须真的存在并限定到嵌套任务列表。
    expect(declaration(NESTED_LIST, 'margin-bottom')).toBe('0.25em')

    // 反向自检：该检查本身具备判别力——裸 `ul` 会被判为外溢，收窄后的不会。
    expect(endsWithPlainList('.ProseMirror ul[data-type="taskList"] li > div > ul')).toBe(true)
    expect(endsWithPlainList('.ProseMirror ul[data-type="taskList"] li > div > ol')).toBe(true)
    expect(endsWithPlainList(NESTED_LIST)).toBe(false)
    expect(endsWithPlainList('.ProseMirror ul[data-type="taskList"] > li')).toBe(false)

    // 通用列表规则保持原值：普通 `ul`/`ol` 的下边距仍是 1em。
    expect(declaration('.ProseMirror ul', 'margin-bottom')).toBe('1em')
    expect(declaration('.ProseMirror ol', 'margin-bottom')).toBe('1em')
  })

  it('连续任务项间距小于段落间距，嵌套任务列表尾部留白同步收窄', () => {
    const paragraphGap = emValue(declaration('.ProseMirror p', 'margin-bottom'), '.ProseMirror p margin-bottom')
    const itemGap = emValue(declaration(ITEM, 'margin-bottom'), '任务项 margin-bottom')

    expect(paragraphGap).toBe(0.75)
    expect(itemGap).toBe(0.25)
    expect(itemGap).toBeLessThan(paragraphGap)

    expect(emValue(declaration(NESTED_LIST, 'margin-bottom'), '嵌套任务列表 margin-bottom')).toBeCloseTo(itemGap)
  })

  it('任务项仍是 flex 行并保留复选框与内容区的间距', () => {
    expect(declaration(ITEM, 'display')).toBe('flex')
    expect(declaration(ITEM, 'align-items')).toBe('flex-start')
    expect(declaration(ITEM, 'gap')).toBeDefined()
  })

  it('新规则全部限定在任务列表范围内，不外溢到普通段落与列表', () => {
    const scopedProperties = ['width', 'height', 'flex', 'min-width']
    const leaked = rules.filter((rule) =>
      rule.selectors.some((selector) => !selector.includes('data-type="taskList"'))
      && scopedProperties.some((property) => property in rule.declarations && /^1 ?1 ?0$|^1em$|^none$/.test(rule.declarations[property])),
    )
    expect(leaked.map((rule) => rule.selectors.join(', '))).toEqual([])

    // 间距类声明同样会被不知不觉外溢出去：本变更引入的 `0.25em` / `0.4em`
    // 一旦出现在非任务列表选择器上，普通段落/列表/引用的排版就被改动了。
    // 例外只有变更前就存在的同名取值：`.ProseMirror li { margin-bottom: 0.25em }`
    // （普通列表项间距，本变更未动），按「选择器 + 属性 + 值」精确白名单放行，
    // 因此给 `.ProseMirror li` 新增 `margin-top: 0.25em` 之类的规则仍会被抓到。
    const spacingProperties = ['margin', 'margin-top', 'margin-bottom', 'padding', 'padding-left', 'gap', 'row-gap', 'column-gap']
    const introducedSpacing = /^0?\.(?:25|4)em$/
    const preExistingGenericSpacing = [
      { selector: '.ProseMirror li', property: 'margin-bottom', value: '0.25em' },
    ].map((entry) => ({ ...entry, selector: normalizeSelector(entry.selector) }))
    const spacingLeaks = rules.flatMap((rule) => rule.selectors
      .filter((selector) => !selector.includes('data-type="taskList"'))
      .flatMap((selector) => spacingProperties
        .filter((property) => {
          const value = rule.declarations[property]
          if (value === undefined || !introducedSpacing.test(value)) return false
          return !preExistingGenericSpacing.some((allowed) =>
            allowed.selector === selector && allowed.property === property && allowed.value === value)
        })
        .map((property) => `${selector} { ${property}: ${rule.declarations[property]} }`)))
    expect(spacingLeaks).toEqual([])

    // 通用规则保持原值：普通段落间距、普通列表项间距、普通列表缩进都没被改动。
    expect(declaration('.ProseMirror p', 'margin-bottom')).toBe('0.75em')
    expect(declaration('.ProseMirror li', 'margin-bottom')).toBe('0.25em')
    expect(declaration('.ProseMirror ul', 'padding-left')).toBe('24px')
  })
})
