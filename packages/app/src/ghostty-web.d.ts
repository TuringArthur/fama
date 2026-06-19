// Ambient declarations for the "ghostty-web" terminal module.
//
// NOTE: `ghostty-web` is not currently declared as a dependency in any
// package.json and is not installed (see packages/app/src/addons/serialize.ts
// and its test). The SerializeAddon it types is not imported by any application
// code today. These declarations exist so `bun typecheck` resolves the imports;
// if/when the real package is wired up, replace this file with its bundled types
// or delete it. Modeled after the xterm.js Terminal API that ghostty-web mirrors.

declare module "ghostty-web" {
  export interface IBufferCell {
    getChars(): string
    getCode(): number
    getWidth(): number
    getFgColorMode(): number
    getBgColorMode(): number
    getFgColor(): number
    getBgColor(): number
    isBold(): number
    isItalic(): number
    isUnderline(): number
    isStrikethrough(): number
    isBlink(): number
    isInverse(): number
    isInvisible(): number
    isFaint(): number
    isDim(): boolean
  }

  export interface IBufferLine {
    readonly length: number
    readonly isWrapped: boolean
    getCell(x: number): IBufferCell | undefined
    translateToString(trimRight?: boolean, startColumn?: number, endColumn?: number): string
  }

  export interface IBuffer {
    readonly type: "normal" | "alternate"
    readonly cursorX: number
    readonly cursorY: number
    readonly viewportY: number
    readonly baseY: number
    readonly length: number
    getLine(y: number): IBufferLine | undefined
    getNullCell(): IBufferCell
  }

  export interface IBufferRange {
    start: { x: number; y: number }
    end: { x: number; y: number }
  }

  export interface ITerminalCore {
    buffer: {
      active: IBuffer
      normal?: IBuffer
      alternate?: IBuffer
    }
    cols: number
    rows: number
  }

  export interface ITerminalInitOptions {
    cols?: number
    rows?: number
    ghostty?: Ghostty
  }

  export interface ITerminalAddon {
    activate(terminal: ITerminalCore): void
    dispose(): void
  }

  export class Ghostty {
    static load(): Promise<Ghostty>
  }

  export class Terminal {
    constructor(options: ITerminalInitOptions)
    buffer: { active: IBuffer; normal: IBuffer; alternate: IBuffer }
    cols: number
    rows: number
    write(data: string, callback?: () => void): void
    open(parent: HTMLElement): void
    loadAddon(addon: ITerminalAddon): void
    reset(): void
    dispose(): void
  }
}
