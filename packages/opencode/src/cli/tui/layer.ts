import { run as runTui, type TuiInput } from "@fama-ai/tui"
import { Global } from "@fama-ai/core/global"
import { Effect } from "effect"

export function run(input: TuiInput) {
  return runTui(input).pipe(Effect.provide(Global.defaultLayer))
}
