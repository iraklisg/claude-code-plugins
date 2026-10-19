import { expect, mock, test } from 'claude-code/testing'

import { bandLine, factsLine } from '../hooks/register'

const TURN = 'turn-1'

const editResult = {
  filePath: 'src/a.ts',
  oldString: 'a',
  newString: 'b',
  originalFile: 'a\n',
  structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 2, lines: ['-a', '+b', '+c'] }],
  userModified: false,
  replaceAll: false,
}

test('facts line sums files, commands and the last test run', () => {
  const files = new Map([
    ['a.ts', { added: 2, removed: 1 }],
    ['b.ts', { added: 1, removed: 0 }],
  ])
  expect(factsLine({ files, cmds: 1, testsPassed: true, tasks: new Map() })).toBe(
    '◇ 2 files +3 −1 · 1 cmd · tests ✓',
  )
  expect(factsLine({ files: new Map(), cmds: 0, testsPassed: null, tasks: new Map() })).toBe('')
})

test('band shows progress over activity', () => {
  expect(bandLine({ activity: 'Reading', tools: 7, agents: 0, todo: null })).toBe('◇ Reading · 7 tools')
  expect(
    bandLine({ activity: 'Editing', tools: 3, agents: 2, todo: { done: 2, total: 3, current: 'Updating routes' } }),
  ).toBe('▰▰▱ 2/3 · Updating routes · 2 agents')
})

test('turn end shows the facts line after an edit and a failed test run', async ($, on) => {
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
  expect((await row.find({ type: 'Text', text: '◇' }))?.text).toBe('◇ 1 file +2 −1 · 1 cmd · tests ✗')
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
  expect((await row.find({ type: 'Text', text: '◇' }))?.text).toBe('◇ 1 cmd · tests ✗')
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

    const failed = await row('Bash', true)
    expect(await failed.drawn()).not.toMatchObject({ props: { display: 'none' } })
  })
}
