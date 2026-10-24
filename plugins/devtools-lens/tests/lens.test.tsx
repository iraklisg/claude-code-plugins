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

// `ps` rows under this session's Claude process, pid 100.
const OURS = (args: string) => `100\n  200   100 ${args}\n  201   200 chrome-devtools-mcp`

function engine(on: On, ps: string, results: Record<string, string> | (() => string)) {
  on('process.run', () => ({ value: { exitCode: 0, stdout: ps, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('clock.now', () => ({ value: 0 }))
  on('tool.call', (_, e) => ({
    result: {},
    text: typeof results === 'function' ? results() : (results[e.tool] ?? ''),
  }))
}

const call = ($: Engine, tool: string, input: Record<string, unknown>) =>
  $.tool.call({ tool, ...input } as Parameters<Engine['tool']['call']>[0])

test('the band shows where the browser landed, after redirects', async ($, on) => {
  engine(on, OURS('npm exec chrome-devtools-mcp@latest --headless=true'), { [NAV]: PAGES })

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

test('a headless browser adds the headless rule to the system prompt', async ($, on) => {
  engine(on, OURS('npm exec chrome-devtools-mcp@latest --headless=true --isolated=true'), { [NAV]: PAGES })
  on('prompt.compose', () => ({ sections: [] }))

  await call($, NAV, { pageId: 2, type: 'url', url: 'http://localhost:8000/de/account/' })
  const composed = await $.prompt.compose({
    model: 'm',
    promptModel: 'm',
    surfaces: ['terminal'],
    tools: [NAV],
    outputStyle: null,
    traits: [],
  })
  expect(composed.sections.map(section => section.id)).toEqual(['devtools-lens:headless'])
})

test('a visible browser adds no rule', async ($, on) => {
  engine(on, OURS('npm exec chrome-devtools-mcp@latest --isolated=true'), { [NAV]: PAGES })
  on('prompt.compose', () => ({ sections: [] }))

  await call($, NAV, { pageId: 2, type: 'url', url: 'http://localhost:8000/de/account/' })
  const composed = await $.prompt.compose({
    model: 'm',
    promptModel: 'm',
    surfaces: ['terminal'],
    tools: [NAV],
    outputStyle: null,
    traits: [],
  })
  expect(composed.sections).toEqual([])
})

const pagesOn = (url: string, title: string) =>
  `Successfully navigated.\n## Pages\n1: ${title} (${url}) [selected]`

test('a visited page the reply names is pinned; pages passed through are not', async ($, on) => {
  let landing = ''
  engine(on, '', () => landing)
  on('turn.complete', (_, e) => ({ text: e.answer }))

  const visit = async (url: string, title: string, width: number) => {
    title = `${title} - Example Site`
    landing = pagesOn(url, title)
    await call($, 'mcp__chrome-devtools__resize_page', { pageId: 1, width, height: 800 })
    await call($, NAV, { pageId: 1, type: 'url', url })
  }
  await visit('http://site.test/magazin/', 'Overview', 1280)
  await visit('http://site.test/magazin/list/article-2/', 'Article', 390)
  await visit('http://site.test/magazin/list/article-2/', 'Article', 1280)
  await visit('http://site.test/other/', 'Side page', 1280)

  await $.turn.complete({
    answer: 'Here it is: **Article**\n\nhttp://site.test/magazin/list/article-2/\n\nAlso http://never.visited/.',
    durationMs: 1,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const pin = await ui.find({ type: 'Text', text: /\uf268 Article/ })
  expect(pin?.text).toContain('\uf268 Article  http://site.test/magazin/list/article-2/')
  expect(pin?.text).toContain('/  \uf10b 390  \uf108 1280')
  expect(await ui.find({ type: 'Text', text: /Overview|Side page/ })).toBeUndefined()
  await ui.unmount()
})

test('the next prompt clears the pins and the current page', async ($, on) => {
  let landing = pagesOn('http://site.test/a/', 'Page A')
  engine(on, '', () => landing)
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const prompt = () =>
    $.prompt.submit({ text: 'next', wait: false, origin: { kind: 'composer' } } as Parameters<Engine['prompt']['submit']>[0])
  const band = async () => {
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    const text = (await ui.find({ type: 'Text' }))?.text
    await ui.unmount()
    return text
  }

  await prompt()
  await call($, NAV, { pageId: 1, type: 'url', url: 'http://site.test/a/' })
  expect(await band()).toContain('\uf268 Page A')
  landing = pagesOn('http://site.test/b/', 'Page B')
  await call($, NAV, { pageId: 1, type: 'url', url: 'http://site.test/b/' })
  await $.turn.complete({ answer: 'See http://site.test/a/', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  expect(await band()).toContain('\uf268 Page A  http://site.test/a/')

  await prompt()
  expect(await band()).toBe('engine')
})

test("another session's headless server adds no rule", async ($, on) => {
  engine(on, '100\n  300   999 npm exec chrome-devtools-mcp@latest --headless=true', { [NAV]: PAGES })
  on('prompt.compose', () => ({ sections: [] }))

  await call($, NAV, { pageId: 2, type: 'url', url: 'http://localhost:8000/de/account/' })
  const composed = await $.prompt.compose({
    model: 'm',
    promptModel: 'm',
    surfaces: ['terminal'],
    tools: [NAV],
    outputStyle: null,
    traits: [],
  })
  expect(composed.sections).toEqual([])
})
