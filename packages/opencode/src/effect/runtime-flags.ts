import { Config, ConfigProvider, Context, Effect, Layer, Option } from "effect"
import { ConfigService } from "@/effect/config-service"

const bool = (name: string) => Config.boolean(name).pipe(Config.withDefault(false))
const positiveInteger = (name: string) =>
  Config.number(name).pipe(
    Config.map((value) => (Number.isInteger(value) && value > 0 ? value : undefined)),
    Config.orElse(() => Config.succeed(undefined)),
  )
const experimental = bool("FAMA_EXPERIMENTAL")
const enabledByExperimental = (name: string) =>
  Config.all({ experimental, enabled: Config.boolean(name).pipe(Config.option) }).pipe(
    Config.map((flags) => Option.getOrElse(flags.enabled, () => flags.experimental)),
  )

export class Service extends ConfigService.Service<Service>()("@fama/RuntimeFlags", {
  autoShare: bool("FAMA_AUTO_SHARE"),
  pure: bool("FAMA_PURE"),
  disableDefaultPlugins: bool("FAMA_DISABLE_DEFAULT_PLUGINS"),
  disableEmbeddedWebUi: bool("FAMA_DISABLE_EMBEDDED_WEB_UI"),
  disableExternalSkills: bool("FAMA_DISABLE_EXTERNAL_SKILLS"),
  disableLspDownload: bool("FAMA_DISABLE_LSP_DOWNLOAD"),
  disableClaudeCodePrompt: Config.all({
    broad: bool("FAMA_DISABLE_CLAUDE_CODE"),
    direct: bool("FAMA_DISABLE_CLAUDE_CODE_PROMPT"),
  }).pipe(Config.map((flags) => flags.broad || flags.direct)),
  disableClaudeCodeSkills: Config.all({
    broad: bool("FAMA_DISABLE_CLAUDE_CODE"),
    direct: bool("FAMA_DISABLE_CLAUDE_CODE_SKILLS"),
  }).pipe(Config.map((flags) => flags.broad || flags.direct)),
  enableExa: Config.all({
    experimental,
    enabled: bool("FAMA_ENABLE_EXA"),
    legacy: bool("FAMA_EXPERIMENTAL_EXA"),
  }).pipe(Config.map((flags) => flags.experimental || flags.enabled || flags.legacy)),
  enableParallel: Config.all({
    enabled: bool("FAMA_ENABLE_PARALLEL"),
    legacy: bool("FAMA_EXPERIMENTAL_PARALLEL"),
  }).pipe(Config.map((flags) => flags.enabled || flags.legacy)),
  enableExperimentalModels: bool("FAMA_ENABLE_EXPERIMENTAL_MODELS"),
  enableQuestionTool: bool("FAMA_ENABLE_QUESTION_TOOL"),
  experimentalReferences: enabledByExperimental("FAMA_EXPERIMENTAL_REFERENCES"),
  experimentalBackgroundSubagents: enabledByExperimental("FAMA_EXPERIMENTAL_BACKGROUND_SUBAGENTS"),
  experimentalLspTy: bool("FAMA_EXPERIMENTAL_LSP_TY"),
  experimentalLspTool: enabledByExperimental("FAMA_EXPERIMENTAL_LSP_TOOL"),
  experimentalOxfmt: enabledByExperimental("FAMA_EXPERIMENTAL_OXFMT"),
  experimentalPlanMode: enabledByExperimental("FAMA_EXPERIMENTAL_PLAN_MODE"),
  experimentalEventSystem: enabledByExperimental("FAMA_EXPERIMENTAL_EVENT_SYSTEM"),
  experimentalWorkspaces: enabledByExperimental("FAMA_EXPERIMENTAL_WORKSPACES"),
  experimentalIconDiscovery: enabledByExperimental("FAMA_EXPERIMENTAL_ICON_DISCOVERY"),
  outputTokenMax: positiveInteger("FAMA_EXPERIMENTAL_OUTPUT_TOKEN_MAX"),
  bashDefaultTimeoutMs: positiveInteger("FAMA_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS"),
  experimentalNativeLlm: bool("FAMA_EXPERIMENTAL_NATIVE_LLM"),
  experimentalWebSockets: bool("FAMA_EXPERIMENTAL_WEBSOCKETS"),
  client: Config.string("FAMA_CLIENT").pipe(Config.withDefault("cli")),
}) {}

export type Info = Context.Service.Shape<typeof Service>

const emptyConfigLayer = Service.defaultLayer.pipe(
  Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({}))),
  Layer.orDie,
)

export const layer = (overrides: Partial<Info> = {}) =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const flags = yield* Service
      return Service.of({ ...flags, ...overrides })
    }),
  ).pipe(Layer.provide(emptyConfigLayer))

export const defaultLayer = Service.defaultLayer.pipe(Layer.orDie)

export const node = LayerNode.make(defaultLayer, [])

export * as RuntimeFlags from "./runtime-flags"
import { LayerNode } from "@fama-ai/core/effect/layer-node"
