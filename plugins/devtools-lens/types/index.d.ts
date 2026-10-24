export type Page = {
  id: string
  title: string
  url: string
  isSelected: boolean
  context: string | null
}

// A page the browser had selected, with every viewport it was seen at.
export type Visit = {
  url: string
  title: string
  viewports: string[]
  context: string | null
}

declare module 'claude-code' {
  interface PluginState {
    'devtools-lens': {
      viewports: Shaped<Record<string, string>>
      visits: Shaped<Record<string, Visit>>
      trail: Shaped<string[]>
    }
  }
}
