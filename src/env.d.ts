// Type declarations for modules without their own types

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare module '*.css' {
  const content: string
  export default content
}

declare module 'agentic' {
  export const ai: {
    configure(opts: any): void
    speak(text: string): Promise<void>
    stopSpeaking?(): void
    listen(): Promise<string>
    sense?(opts: any): Promise<any>
    think?(opts: any): Promise<any>
    perceive?(opts: any): Promise<any>
    [key: string]: any
  }
  export default ai
}
