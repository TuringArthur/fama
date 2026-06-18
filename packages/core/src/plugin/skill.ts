/// <reference path="../markdown.d.ts" />

export * as SkillPlugin from "./skill"

import { Effect } from "effect"
import { PluginV2 } from "../plugin"
import { AbsolutePath } from "../schema"
import { SkillV2 } from "../skill"
import customizeFamaContent from "./skill/customize-fama.md" with { type: "text" }

export const CustomizeOpencodeContent = customizeFamaContent

export const Plugin = PluginV2.define({
  id: PluginV2.ID.make("skill"),
  effect: Effect.gen(function* () {
    const skill = yield* SkillV2.Service
    const transform = yield* skill.transform()

    yield* transform((editor) => {
      editor.source(
        new SkillV2.EmbeddedSource({
          type: "embedded",
          skill: new SkillV2.Info({
            name: "customize-fama",
            description:
              "Use ONLY when the user is editing or creating fama's own configuration: fama.json, fama.jsonc, files under .fama/, or files under ~/.config/fama/. Also use when creating or fixing fama agents, subagents, skills, plugins, MCP servers, or permission rules. Do not use for the user's own application code, or for any project that is not configuring fama itself.",
            location: AbsolutePath.make("/builtin/customize-fama.md"),
            content: CustomizeOpencodeContent,
          }),
        }),
      )
    })
  }),
})
