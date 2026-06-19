export * as ConfigPaths from "./paths"

import path from "path"
import { Flag } from "@fama-ai/core/flag/flag"
import { Global } from "@fama-ai/core/global"
import { unique } from "remeda"
import * as Effect from "effect/Effect"
import { FSUtil } from "@fama-ai/core/fs-util"

export const files = Effect.fn("ConfigPaths.projectFiles")(function* (
  name: string,
  directory: string,
  worktree?: string,
) {
  const afs = yield* FSUtil.Service
  return (yield* afs.up({
    targets: [`${name}.jsonc`, `${name}.json`],
    start: directory,
    stop: worktree,
  })).toReversed()
})

export const directories = Effect.fn("ConfigPaths.directories")(function* (directory: string, worktree?: string) {
  const afs = yield* FSUtil.Service
  return unique([
    Global.Path.config,
    ...(!Flag.FAMA_DISABLE_PROJECT_CONFIG
      ? yield* afs.up({
          targets: [".fama"],
          start: directory,
          stop: worktree,
        })
      : []),
    ...(yield* afs.up({
      targets: [".fama"],
      start: Global.Path.home,
      stop: Global.Path.home,
    })),
    ...(Flag.FAMA_CONFIG_DIR ? [Flag.FAMA_CONFIG_DIR] : []),
  ])
})

export function fileInDirectory(dir: string, name: string) {
  return [path.join(dir, `${name}.json`), path.join(dir, `${name}.jsonc`)]
}
