// Bumped on every change of the mode, so what reads it redraws.
export type Switched = number

declare module 'claude-code' {
  interface PluginState {
    speak: {
      switched: Switched
    }
  }
}
