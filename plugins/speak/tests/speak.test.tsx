import { expect, mock, test } from 'claude-code/testing'
import type { Plugin, TestBody } from 'claude-code/testing'

const COMPOSE = {
  model: 'claude-opus-5-5',
  promptModel: 'claude-opus-5-5',
  surfaces: ['terminal'],
  tools: [],
  outputStyle: { name: 'default', isKeepingCodingInstructions: true },
  traits: [],
} as never

const sections = async (...[$, on, stored]: [...Parameters<TestBody>, Record<string, unknown>]) => {
  mock.store(on, stored)
  on('prompt.compose', () => ({ sections: [] }) as never)

  return (await $.prompt.compose(COMPOSE)).sections
}

test('off by default: no rule is sent', async ($, on) => {
  expect((await sections($, on, {})).filter(s => s.id.startsWith('speak:'))).toEqual([])
})

test('an unknown stored mode counts as off', async ($, on) => {
  expect((await sections($, on, { mode: 'strict' })).filter(s => s.id.startsWith('speak:'))).toEqual([])
})

test('ste: sends the base and the pragmatic STE rule, with no document skeleton', async ($, on) => {
  const sent = await sections($, on, { mode: 'ste' })
  expect(sent.map(s => s.id)).toEqual(['speak:base', 'speak:ste'])

  const rule = sent.find(s => s.id === 'speak:ste')?.text
  expect(rule).toMatch(/^# ASD-STE100 mode \(speak\)\nWrite chat replies in pragmatic ASD-STE100/)
  expect(rule).not.toMatch(/STE mode is on/)
  expect(rule).toMatch(/No title or headings in short answers/)
  expect(rule).toMatch(/Start with the answer/)
  expect(rule).toMatch(/Before the first step, state each precondition or risk/)
  expect(rule).toMatch(/chat only/)
})

test('caveman: sends the base and the caveman rule, with its clarity exception', async ($, on) => {
  const sent = await sections($, on, { mode: 'caveman' })
  expect(sent.map(s => s.id)).toEqual(['speak:base', 'speak:caveman'])

  const rule = sent.find(s => s.id === 'speak:caveman')?.text
  expect(rule).toMatch(/Sacrifice grammar for the sake of concision/)
  expect(rule).toMatch(/Drop articles/)
  expect(rule).toMatch(/full sentences for security warnings/)
  expect(rule).toMatch(/Negations, numbers and warnings stay complete/)
  expect(rule).toMatch(/chat only/)
  expect(rule).not.toMatch(/ACTIVE EVERY RESPONSE/)
})

test('the base asks for scope, not sentence form', async ($, on) => {
  const base = (await sections($, on, { mode: 'ste' })).find(s => s.id === 'speak:base')?.text
  expect(base).toMatch(/high-level summary unless the user asks/)
  expect(base).toMatch(/disclaimers and caveats short/)
})

for (const mode of ['ste', 'caveman']) {
  test(`${mode}: sets a longer example and a check before sending`, async ($, on) => {
    const sent = await sections($, on, { mode })
    const rule = sent.find(s => s.id === `speak:${mode}`)?.text
    expect(rule).toMatch(/Longer answer/)
    expect(rule).toMatch(/Before you send/)
  })
}

const submitted = async (...[$, on, stored]: [...Parameters<TestBody>, Record<string, unknown>]) => {
  mock.store(on, stored)
  let context: readonly string[] | undefined
  on('prompt.submit', (_$, e) => {
    context = e.context

    return { text: e.text, context: e.context }
  })
  await $.prompt.submit({ text: 'why is the queue slow?', wait: false } as never)

  return context ?? []
}

test('off: no reminder goes with the prompt', async ($, on) => {
  expect(await submitted($, on, {})).toEqual([])
})

test('ste: the reminder goes with every prompt', async ($, on) => {
  const context = await submitted($, on, { mode: 'ste' })
  expect(context).toHaveLength(1)
  expect(context[0]).toMatch(/^speak ste is on/)
  expect(context[0]).toMatch(/Keep articles/)
  expect(context[0]).toMatch(/warnings, conditions and risks before/)
})

test('caveman: the reminder goes with every prompt', async ($, on) => {
  const context = await submitted($, on, { mode: 'caveman' })
  expect(context).toHaveLength(1)
  expect(context[0]).toMatch(/^speak caveman is on/)
  expect(context[0]).toMatch(/delete each a\/an\/the/)
  expect(context[0]).toMatch(/full sentences for security warnings, irreversible actions/)
})

test('the reminder keeps the context other hooks attached, and goes last', async ($, on) => {
  mock.store(on, { mode: 'caveman' })
  let context: readonly string[] | undefined
  on('prompt.submit', (_$, e) => {
    context = e.context

    return { text: e.text, context: e.context }
  })
  await $.prompt.submit({ text: 'hi', wait: false, context: ['from another hook'] } as never)

  expect(context).toHaveLength(2)
  expect(context?.[0]).toBe('from another hook')
  expect(context?.[1]).toMatch(/^speak caveman is on/)
})

test('the prompt text is never changed', async ($, on) => {
  mock.store(on, { mode: 'ste' })
  let text: string | undefined
  on('prompt.submit', (_$, e) => {
    text = e.text

    return { text: e.text, context: e.context }
  })
  await $.prompt.submit({ text: 'why is the queue slow?', wait: false } as never)

  expect(text).toBe('why is the queue slow?')
})

for (const mode of ['ste', 'caveman']) {
  test(`${mode}: no word count target in the rules`, async ($, on) => {
    const rules = (await sections($, on, { mode })).map(s => s.text).join('\n')
    expect(rules).not.toMatch(/\b(60|150) (words|for)\b|Length target|Aim for about/)
  })

  test(`${mode}: no word count target in the reminder`, async ($, on) => {
    const [reminder] = await submitted($, on, { mode })
    expect(reminder).not.toMatch(/\b(60|150) (words|for)\b|Length target|Aim for about/)
  })
}

test('the base no longer carries the truthfulness rule', async ($, on) => {
  expect((await sections($, on, { mode: 'caveman' })).find(s => s.id === 'speak:base')?.text).not.toMatch(/guesses/)
})

test('/speak switches the reminder from the next prompt', async ($, on) => {
  mock.store(on, { mode: 'ste' })
  const seen: string[] = []
  on('prompt.submit', (_$, e) => {
    seen.push(e.context?.at(-1) ?? 'none')

    return { text: e.text, context: e.context }
  })
  const submit = () => $.prompt.submit({ text: 'q', wait: false } as never)

  await submit()
  await $.command.run({ command: 'speak', args: 'caveman' } as never)
  await submit()
  await $.command.run({ command: 'speak', args: 'off' } as never)
  await submit()

  expect(seen[0]).toMatch(/^speak ste is on/)
  expect(seen[1]).toMatch(/^speak caveman is on/)
  expect(seen[2]).toBe('none')
})

const run = async ($: Parameters<TestBody>[0], args: string) =>
  $.command.run({ command: 'speak', args } as never) as Promise<{ text: string }>

test('/speak sets and reports the mode, from the next request', async ($, on) => {
  mock.store(on)
  on('prompt.compose', () => ({ sections: [] }) as never)
  const sent = async () => (await $.prompt.compose(COMPOSE)).sections.map(s => s.id)

  expect((await run($, '')).text).toBe('speak off')
  expect((await run($, 'ste')).text).toBe('speak ste (from the next request)')
  expect(await sent()).toContain('speak:ste')
  expect((await run($, 'status')).text).toBe('speak ste')
  expect((await run($, 'Caveman')).text).toBe('speak caveman (from the next request)')
  expect(await sent()).toEqual(['speak:base', 'speak:caveman'])
  expect((await run($, 'off')).text).toBe('speak off (from the next request)')
  expect(await sent()).toEqual([])
  expect((await run($, 'terse')).text).toBe('use /speak [off|ste|caveman|status]')
  expect((await run($, '')).text).toBe('speak off')
})

const footer = async ($: Parameters<TestBody>[0]) =>
  $.ui.mount({
    plugin: 'speak',
    surface: 'terminal',
    component: 'SessionMode',
    requestId: 'm1',
    props: { modes: [] },
  } as never)

test('the footer stays drawn when off, and clicks cycle off -> ste -> caveman -> off', async ($, on) => {
  mock.store(on)
  on('ui.render', () => ({ type: 'Box', props: {}, children: [] }) as never)
  const row = await footer($)
  const label = async () => (await row.find({ type: 'Button' }))?.text

  expect(await label()).toBe('speak off')
  expect(await row.find({ text: /·/ })).toBeUndefined()
  await row.press({ key: 'speak' })
  expect(await label()).toBe('speak ste')
  await row.press({ key: 'speak' })
  expect(await label()).toBe('speak caveman')
  await row.press({ key: 'speak' })
  expect(await label()).toBe('speak off')
})

// Stands in for zen, which adds its own switch to the same footer.
const zen: Plugin = {
  name: 'zen',
  register: on => {
    on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
      const { Box, Button } = $.ui.resolve(e)

      return (
        <Box flexDirection="row">
          {await next(e)}
          <Button key="zen" plain onPress={() => undefined}>
            {'zen'}
          </Button>
        </Box>
      )
    })
  },
}

test("the speak switch joins another plugin's switch and the engine's modes", { plugins: [zen] }, async ($, on) => {
  mock.store(on, { mode: 'ste' })
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['focus'] }) as never)
  const row = await footer($)

  expect((await row.findAll({ type: 'Button' })).map(one => one.text)).toEqual(
    expect.arrayContaining(['zen', 'speak ste']),
  )
  expect(await row.find({ text: 'focus' })).toBeDefined()
  expect(await row.find({ text: /·/ })).toBeDefined()
})
