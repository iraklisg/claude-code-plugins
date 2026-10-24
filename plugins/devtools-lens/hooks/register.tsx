import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Page } from '../types'

// Last viewport set per page id, from resize_page / emulate.
const viewports = atom({ plugin: 'devtools-lens', key: 'viewports' } as const, {}, {
  shape: 'viewports-1',
})
// Every page the browser visited this session, by normalized URL.
const visits = atom({ plugin: 'devtools-lens', key: 'visits' } as const, {}, {
  shape: 'visits-3',
})
// The pages visited since the person's last prompt, by normalized URL, the
// latest visit last: what the band shows. The next prompt clears it.
const trail = atom({ plugin: 'devtools-lens', key: 'trail' } as const, [], {
  shape: 'trail-1',
})

// Any MCP server named chrome-devtools, however it is installed.
const TOOL = /^mcp__.*chrome-devtools.*__(\w+)$/
// Tools whose result carries no page list but may change the page.
const MAY_NAVIGATE = new Set(['click', 'press_key', 'type_text', 'fill_form', 'handle_dialog'])
const MAX_ROWS = 8
// Nerd Font glyphs: nf-fa-chrome, nf-fa-user_secret, nf-fa-mobile,
// nf-fa-tablet, nf-fa-desktop.
const CHROME = '\uf268'
const INCOGNITO = '\uf21b'
const PHONE = '\uf10b'
const TABLET = '\uf10a'
const DESKTOP = '\uf108'
const TITLE_CHARS = 48

// "## Pages" lines: `2: Title (http://x/) [selected] isolatedContext=name`
// or a bare `1: about:blank [selected]`.
function parsePages(text: string): Page[] | null {
  const block = text.split('## Pages\n')[1]
  if (block === undefined) return null
  const list: Page[] = []
  for (const line of block.split('\n')) {
    const match = line.match(/^(\d+): (.*?)( \[selected\])?(?: isolatedContext=(\S+))?$/)
    if (!match) break
    const [, id = '', body = '', selected, context] = match
    const open = body.lastIndexOf(' (')
    const hasTitle = open > 0 && body.endsWith(')')
    list.push({
      id,
      title: hasTitle ? body.slice(0, open) : '',
      url: hasTitle ? body.slice(open + 2, -1) : body,
      isSelected: selected !== undefined,
      context: context ?? null,
    })
  }
  return list
}

function viewportOf(input: Record<string, unknown>): string | null {
  if (typeof input.width === 'number' && typeof input.height === 'number') {
    return `${input.width}×${input.height}`
  }
  if (typeof input.viewport === 'string') {
    const [size = ''] = input.viewport.split(',')
    const [w, hgt] = size.split('x')
    return `${w}×${hgt}`
  }
  return null
}

// One spelling per page: decoded, without the fragment or a trailing slash.
function normalize(url: string): string {
  let decoded = url
  try {
    decoded = decodeURI(url)
  } catch {}
  return decoded.replace(/#.*$/, '').replace(/\/+$/, '')
}

// The browser's page list after a call that may have navigated without
// printing one: list_pages on the same server, run only where the person's
// permissions already allow it, so no dialog opens. Null where it can't.
async function pageListAfter($: EngineInterface, tool: string): Promise<string | null> {
  const listPages = tool.replace(/__\w+$/, '__list_pages')
  const { decision } = await $.tool.check({ tool: listPages, input: {} }).catch(() => ({ decision: 'deny' }))
  if (decision !== 'allow') return null
  const ran = await $.tool.call({ tool: listPages } as Parameters<EngineInterface['tool']['call']>[0]).catch(() => null)
  return ran?.text ?? null
}

// A viewport as its device's glyph and width: "390×844" reads " 390".
function device(size: string): string {
  const width = Number.parseInt(size, 10)
  const glyph = width < 768 ? PHONE : width < 1024 ? TABLET : DESKTOP
  return Number.isNaN(width) ? size : `${glyph} ${width}`
}

const isBlank = (url: string) => url === 'about:blank' || url === ''

// Titles end in the site's name ("Page - Site", "Page | Site"): drop it.
const shorten = (title: string, url: string) => {
  const text = title.replace(/\s+[-|–—]\s+[^-|–—]+$/, '') || url
  return text.length > TITLE_CHARS ? `${text.slice(0, TITLE_CHARS - 1)}…` : text
}

export const register: Register = on => {
  on('tool.call', async ($, e, next) => {
    const name = e.tool.match(TOOL)?.[1]
    if (name === undefined) return next(e)

    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError) return ran

    const input = e as unknown as Record<string, unknown>
    const id = typeof input.pageId === 'number' ? String(input.pageId) : null

    const size = viewportOf(input)
    if (size !== null && id !== null) await update($, viewports, all => ({ ...all, [id]: size }))

    const printed = parsePages(ran.text ?? '')
    const list = printed ?? (MAY_NAVIGATE.has(name) ? parsePages((await pageListAfter($, e.tool)) ?? '') : null)
    if (list === null) return ran

    // The page the call acted on: the one it names, else the selected one (a
    // call without a page id acts on it, and new_page selects what it opens).
    // Not the selected one when the call names another: navigating a page by
    // its id leaves another selected. list_pages acts on none.
    const target = id !== null
      ? list.find(page => page.id === id)
      : name === 'list_pages' ? undefined : list.find(page => page.isSelected)
    if (target === undefined || isBlank(target.url)) return ran
    if (size !== null && id === null) await update($, viewports, all => ({ ...all, [target.id]: size }))
    const key = normalize(target.url)
    await update($, trail, keys => [...keys.filter(known => known !== key), key])
    const seenAt = (await read($, viewports))[target.id]
    await update($, visits, all => {
      const known = all[key]?.viewports ?? []
      const sizes = seenAt === undefined || known.includes(seenAt) ? known : [...known, seenAt]
      return { ...all, [key]: { url: target.url, title: target.title, viewports: sizes, context: target.context } }
    })
    return ran
  })

  on('prompt.submit', async ($, e, next) => {
    await update($, trail, () => [])
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const keys = (await read($, trail)).slice(-MAX_ROWS)
    if (e.props.hasSurvey || keys.length === 0) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const seen = await read($, visits)
    const rows = keys.flatMap(key => (seen[key] ? [seen[key]] : []))

    return (
      <Box flexDirection="column">
        {rows.map(visit => (
          <Text>
            {CHROME} {visit.title ? <Text weight="bold">{`${shorten(visit.title, visit.url)}  `}</Text> : ''}
            <Text color="suggestion">{visit.url}</Text>
            <Text dimColor>
              {visit.viewports.map(size => `  ${device(size)}`).join('')}
              {visit.context ? `  ${INCOGNITO}` : ''}
            </Text>
          </Text>
        ))}
      </Box>
    )
  })
}
