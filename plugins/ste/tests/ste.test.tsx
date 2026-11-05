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

const ids = async (...[$, on, stored]: [...Parameters<TestBody>, Record<string, unknown>]) => {
  mock.store(on, stored)
  on('prompt.compose', () => ({ sections: [] }) as never)

  return (await $.prompt.compose(COMPOSE)).sections
}

test('off by default: no rule is sent', async ($, on) => {
  expect((await ids($, on, {})).map(s => s.id)).not.toContain('ste:rule')
})

test('on: sends the pragmatic rule, with no document skeleton', async ($, on) => {
  const rule = (await ids($, on, { isOn: true })).find(s => s.id === 'ste:rule')
  expect(rule?.text).toMatch(/^# ASD-STE100 mode \(ste\)\nSTE mode is on\./)
  expect(rule?.text).toMatch(/No title or headings in short answers/)
  expect(rule?.text).toMatch(/chat only/)
})

const run = async ($: Parameters<TestBody>[0], args: string) =>
  $.command.run({ command: 'ste', args } as never) as Promise<{ text: string }>

test('/ste toggles, sets and reports the switch, from the next request', async ($, on) => {
  mock.store(on)
  on('prompt.compose', () => ({ sections: [] }) as never)
  const isSent = async () => (await $.prompt.compose(COMPOSE)).sections.some(s => s.id === 'ste:rule')

  expect((await run($, 'on')).text).toBe('ste on (from the next request)')
  expect(await isSent()).toBe(true)
  expect((await run($, 'status')).text).toBe('ste on')
  expect((await run($, '')).text).toBe('ste off (from the next request)')
  expect(await isSent()).toBe(false)
  expect((await run($, 'strict')).text).toBe('use /ste [on|off|status]')
})

const footer = async ($: Parameters<TestBody>[0]) =>
  $.ui.mount({
    plugin: 'ste',
    surface: 'terminal',
    component: 'SessionMode',
    requestId: 'm1',
    props: { modes: [] },
  } as never)

test('the footer switch stays drawn when off, and a click turns it on', async ($, on) => {
  mock.store(on)
  on('ui.render', () => ({ type: 'Box', props: {}, children: [] }) as never)
  const row = await footer($)

  expect((await row.find({ type: 'Button' }))?.text).toBe('ste off')
  expect(await row.find({ text: /·/ })).toBeUndefined()
  await row.press({ key: 'ste' })
  expect((await row.find({ type: 'Button' }))?.text).toBe('ste')
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

test("the ste switch joins another plugin's switch and the engine's modes", { plugins: [zen] }, async ($, on) => {
  mock.store(on, { isOn: true })
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['focus'] }) as never)
  const row = await footer($)

  expect((await row.findAll({ type: 'Button' })).map(one => one.text)).toEqual(expect.arrayContaining(['zen', 'ste']))
  expect(await row.find({ text: 'focus' })).toBeDefined()
  expect(await row.find({ text: /·/ })).toBeDefined()
})
