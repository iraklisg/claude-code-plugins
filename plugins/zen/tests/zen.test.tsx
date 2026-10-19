import { expect, mock, test } from 'claude-code/testing'

import { agentsLine, bandLine, factsLine } from '../hooks/register'

const TURN = 'turn-1'
const TWO = [
  { id: 'a1', description: 'Explore auth code paths' },
  { id: 'a2', description: 'Repo conventions research' },
]

const editResult = {
  filePath: 'src/a.ts',
  oldString: 'a',
  newString: 'b',
  originalFile: 'a\n',
  structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 2, lines: ['-a', '+b', '+c'] }],
  userModified: false,
  replaceAll: false,
}

test('facts line reports only the last test run', () => {
  expect(factsLine({ testsPassed: true, tasks: new Map() })).toBe('◇ tests ✓')
  expect(factsLine({ testsPassed: false, tasks: new Map() })).toBe('◇ tests ✗')
  expect(factsLine({ testsPassed: null, tasks: new Map() })).toBe('')
})

test('band shows progress over activity', () => {
  expect(bandLine({ activity: 'Reading', tools: 7, todo: null }, [])).toBe('◇ Reading · 7 tools')
  expect(
    bandLine({ activity: 'Editing', tools: 3, todo: { done: 2, total: 3, current: 'Updating routes' } }, TWO),
  ).toBe('▰▰▱ 2/3 · Updating routes · 2 agents')
  expect(agentsLine(TWO)).toBe(
    '◇ 2 agents running · Explore auth code paths, Repo conventions research',
  )
})

test('turn end shows a failed test run, not the edit', async ($, on) => {
  mock.store(on)
  on('tool.call', (_, e) =>
    e.tool === 'Edit'
      ? { result: editResult }
      : { isError: true as const, result: 'Exit code 1', text: 'Exit code 1' },
  )
  on('turn.start', (_, e) => e as never)
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['Baked for 0s'] }) as never)
  on('turn.complete', (_, e) => ({ text: e.answer }))

  await $.turn.start({ text: 'fix it', turnId: TURN } as never)
  await $.tool.call({
    tool: 'Edit',
    tool_use_id: 't1',
    file_path: 'src/a.ts',
    old_string: 'a',
    new_string: 'b',
  } as never)
  await $.tool.call({ tool: 'Bash', tool_use_id: 't2', command: 'pnpm vitest run' } as never)
  const done = await $.turn.complete({
    answer: 'Fixed.',
    durationMs: 10,
    isAborted: false,
    turnId: TURN,
    reason: 'answer',
  } as never)

  expect(done.text).toBe('Fixed.')
  const row = await $.ui.mount({
    plugin: 'zen',
    surface: 'terminal',
    component: 'TurnDuration',
    requestId: 'd1',
    props: { word: 'Baked', durationMs: 10 },
  })
  expect((await row.find({ type: 'Text', text: '◇' }))?.text).toBe('◇ tests ✗')
})

test('a piped test run that printed failures counts as failed', async ($, on) => {
  mock.store(on)
  on('turn.start', (_, e) => e as never)
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false }, text: 'Tests  1 failed | 2 passed (3)' }) as never)
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['Baked for 0s'] }) as never)

  await $.turn.start({ text: 'run tests', turnId: TURN } as never)
  await $.tool.call({ tool: 'Bash', tool_use_id: 't1', command: 'pnpm test 2>&1 | tail -5' } as never)
  await $.turn.complete({ answer: 'Done.', durationMs: 10, isAborted: false, turnId: TURN, reason: 'answer' } as never)
  const row = await $.ui.mount({
    plugin: 'zen',
    surface: 'terminal',
    component: 'TurnDuration',
    requestId: 'd1',
    props: { word: 'Baked', durationMs: 10 },
  })
  expect((await row.find({ type: 'Text', text: '◇' }))?.text).toBe('◇ tests ✗')
})

test('read-only turn leaves the answer alone', async ($, on) => {
  mock.store(on)
  on('tool.call', () => ({ result: { type: 'text', file: { filePath: 'x', content: '' } } }) as never)
  on('turn.start', (_, e) => e as never)
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['Baked for 0s'] }) as never)
  on('turn.complete', (_, e) => ({ text: e.answer }))

  await $.turn.start({ text: 'explain', turnId: TURN } as never)
  await $.tool.call({ tool: 'Read', tool_use_id: 't1', file_path: 'x' } as never)
  const done = await $.turn.complete({
    answer: 'It works like so.',
    durationMs: 10,
    isAborted: false,
    turnId: TURN,
    reason: 'answer',
  } as never)

  expect(done.text).toBe('It works like so.')
  const row = await $.ui.mount({
    plugin: 'zen',
    surface: 'terminal',
    component: 'TurnDuration',
    requestId: 'd1',
    props: { word: 'Baked', durationMs: 10 },
  })
  expect(await row.find({ type: 'Text', text: '◇' })).toBeUndefined()
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`hides a quiet row and keeps an errored one (${surface})`, async ($, on) => {
    mock.store(on)
    on('ui.render', () => ({ type: 'Text', props: {}, children: ['engine row'] }) as never)
    const row = (tool: string, isErrored: boolean) =>
      $.ui.mount({
        plugin: 'zen',
        surface,
        component: 'ToolUse',
        requestId: `${tool}-${isErrored}`,
        props: { tool_use_id: 'x', tool, input: {}, isRunning: false, isErrored, isInterrupted: false },
      } as never)

    const quiet = await row('Read', false)
    expect(await quiet.drawn()).toMatchObject({ type: 'Box', props: { display: 'none' } })

    const edit = await row('Edit', false)
    expect(await edit.drawn()).toMatchObject({ type: 'Box', props: { display: 'none' } })

    const failed = await row('Bash', true)
    expect(await failed.drawn()).not.toMatchObject({ props: { display: 'none' } })
  })
}

test('hides text written before a tool call and keeps the final answer', async ($, on) => {
  mock.store(on)
  on('turn.step', async function* (_, e) {
    return {
      turnId: e.turnId,
      index: e.index,
      answer: e.index === 0 ? 'Let me check the tests.' : 'Fixed.',
      toolUses: e.index === 0 ? [{ id: 't1', name: 'Bash', input: {} }] : [],
      stopReason: e.index === 0 ? 'tool_use' : 'end_turn',
      usage: null,
    } as never
  })
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['engine row'] }) as never)

  for (const index of [0, 1]) {
    const stream = $.turn.step({ turnId: TURN, index, model: 'm', messageCount: 1 } as never)
    for await (const _ of stream as AsyncIterable<unknown>) void _
  }
  const block = (text: string) =>
    $.ui.mount({
      plugin: 'zen',
      surface: 'terminal',
      component: 'AssistantMessage',
      requestId: text,
      props: { text, isFirstOfReply: true },
    } as never)

  expect(await (await block('Let me check  the tests.')).drawn()).toMatchObject({ props: { display: 'none' } })
  expect(await (await block('Fixed.')).drawn()).not.toMatchObject({ props: { display: 'none' } })
})
