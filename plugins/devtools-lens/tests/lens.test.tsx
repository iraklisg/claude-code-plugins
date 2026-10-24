import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const BAND = {
  plugin: 'devtools-lens',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 160,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const NAV = 'mcp__chrome-devtools__navigate_page'

const PAGES = [
  'Successfully navigated to http://localhost:8000/de/account/.',
  '## Pages',
  '1: about:blank',
  '2: Login – Site (http://localhost:8000/de/login?next=/de/account/) [selected] isolatedContext=guest',
].join('\n')

function engine(on: On, results: Record<string, string> | (() => string)) {
  on('tool.call', (_, e) => ({
    result: {},
    text: typeof results === 'function' ? results() : (results[e.tool] ?? ''),
  }))
}

const call = ($: Engine, tool: string, input: Record<string, unknown>) =>
  $.tool.call({ tool, ...input } as Parameters<Engine['tool']['call']>[0])

const pagesOn = (url: string, title: string) =>
  `Successfully navigated.\n## Pages\n1: ${title} (${url}) [selected]`

test('the band shows where the browser landed, after redirects', async ($, on) => {
  engine(on, { [NAV]: PAGES })

  await call($, 'mcp__chrome-devtools__resize_page', { pageId: 2, width: 390, height: 844 })
  await call($, NAV, { pageId: 2, type: 'url', url: 'http://localhost:8000/de/account/' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const row = await ui.find({ type: 'Text', text: /\uf268/ })
    expect(row?.text).toContain('\uf268 Login  http://localhost:8000/de/login')
    expect(row?.text).toContain('\uf10b 390')
    expect(row?.text).toContain('\uf21b')
    expect(row?.text).not.toContain('about:blank')
    await ui.unmount()
  }
})

test('nothing shows before a real page is open', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
  await ui.unmount()
})

test('the band follows the page a call acts on, not the selected one', async ($, on) => {
  const twoPages = [
    'Successfully navigated.',
    '## Pages',
    '1: Article - Site (http://site.test/article/)',
    '2: Editing Other - Site (http://site.test/cms/pages/534/edit/) [selected]',
  ].join('\n')
  engine(on, { [NAV]: twoPages, 'mcp__chrome-devtools__list_pages': twoPages })

  await call($, NAV, { pageId: 1, type: 'url', url: 'http://site.test/article/' })
  await call($, 'mcp__chrome-devtools__list_pages', {})

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: // }))?.text).toContain(' Article  http://site.test/article/')
  expect(await ui.find({ type: 'Text', text: /534/ })).toBeUndefined()
  await ui.unmount()
})

test('a call without a page id follows the selected page', async ($, on) => {
  const twoPages = [
    'Successfully navigated.',
    '## Pages',
    '1: Article - Site (http://site.test/article/)',
    '2: Home - Site (http://site.test/) [selected]',
  ].join('\n')
  engine(on, { [NAV]: twoPages, 'mcp__chrome-devtools__resize_page': twoPages })

  await call($, 'mcp__chrome-devtools__resize_page', { width: 390, height: 844 })
  await call($, NAV, { type: 'url', url: 'http://site.test/' })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const rows = await ui.findAll({ type: 'Text', text: /\uf268/ })
  expect(rows.map(row => row.text)).toEqual(['\uf268 Home  http://site.test/  \uf10b 390'])
  await ui.unmount()
})

test("the band lists the turn's pages in visit order, a revisit moving last, at most eight", async ($, on) => {
  let landing = ''
  engine(on, () => landing)

  const visit = async (url: string, title: string, width: number) => {
    landing = pagesOn(url, `${title} - Example Site`)
    await call($, 'mcp__chrome-devtools__resize_page', { pageId: 1, width, height: 800 })
    await call($, NAV, { pageId: 1, type: 'url', url })
  }
  await visit('http://site.test/magazin/', 'Overview', 1280)
  await visit('http://site.test/magazin/list/article-2/', 'Article', 390)
  await visit('http://site.test/cms/pages/205/edit/', 'Editing Article', 1280)
  await visit('http://site.test/magazin/list/article-2/', 'Article', 1280)
  for (const n of [1, 2, 3, 4, 5, 6]) await visit(`http://site.test/p${n}/`, `P${n}`, 1280)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const rows = await ui.findAll({ type: 'Text', text: // })
  expect(rows.map(row => row.text.split('  ')[0])).toEqual([
    ' Editing Article', ' Article', ' P1', ' P2', ' P3', ' P4', ' P5', ' P6',
  ])
  expect(rows[1]?.text).toContain(' Article  http://site.test/magazin/list/article-2/   390   1280')
  await ui.unmount()
})

test('the next prompt clears the band', async ($, on) => {
  engine(on, () => pagesOn('http://site.test/a/', 'Page A'))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const band = async () => {
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    const text = (await ui.find({ type: 'Text' }))?.text
    await ui.unmount()
    return text
  }

  await call($, NAV, { pageId: 1, type: 'url', url: 'http://site.test/a/' })
  expect(await band()).toContain(' Page A  http://site.test/a/')
  await $.prompt.submit({ text: 'next', wait: false, origin: { kind: 'composer' } } as Parameters<Engine['prompt']['submit']>[0])
  expect(await band()).toBe('engine')
})

test('a click that navigates shows the page it lands on', async ($, on) => {
  engine(on, {
    'mcp__chrome-devtools__new_page': pagesOn('http://site.test/cms/login/?next=/cms/pages/185/edit/', 'Sign in - Site'),
    'mcp__chrome-devtools__click': 'Clicked.',
    'mcp__chrome-devtools__list_pages': pagesOn('http://site.test/cms/pages/185/edit/', 'Editing Page 185 - Site'),
  })
  on('tool.check', () => ({ decision: 'allow' }))

  await call($, 'mcp__chrome-devtools__new_page', { url: 'http://site.test/cms/pages/185/edit/' })
  await call($, 'mcp__chrome-devtools__click', { pageId: 1, uid: '1_16' })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const rows = await ui.findAll({ type: 'Text', text: // })
  expect(rows.map(row => row.text.split('  ')[0])).toEqual([' Sign in', ' Editing Page 185'])
  await ui.unmount()
})

test('without permission for list_pages, a click adds nothing and opens no dialog', async ($, on) => {
  const listed: string[] = []
  engine(on, () => pagesOn('http://site.test/a/', 'Page A'))
  on('tool.check', () => ({ decision: 'ask' }))
  on('tool.call', { tool: 'mcp__chrome-devtools__list_pages' }, (_, e) => {
    listed.push(e.tool)
    return { result: {}, text: '' }
  })

  await call($, 'mcp__chrome-devtools__click', { pageId: 1, uid: '1_2' })
  expect(listed).toEqual([])
})
