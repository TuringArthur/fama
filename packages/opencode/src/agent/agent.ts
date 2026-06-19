import { LayerNode } from "@fama-ai/core/effect/layer-node"
import { PermissionV1 } from "@fama-ai/core/v1/permission"
import { Config } from "@/config/config"
import { serviceUse } from "@fama-ai/core/effect/service-use"
import { Provider } from "@/provider/provider"

import { generateObject, streamObject, type ModelMessage } from "ai"
import { Truncate } from "@/tool/truncate"
import { Auth } from "../auth"
import { ProviderTransform } from "@/provider/transform"

import PROMPT_GENERATE from "./generate.txt"
import PROMPT_COMPACTION from "./prompt/compaction.txt"
import PROMPT_COUNSEL from "./prompt/counsel.txt"
import PROMPT_EXPLORE from "./prompt/explore.txt"
import PROMPT_JUDGE from "./prompt/judge.txt"
import PROMPT_LAWYER from "./prompt/lawyer.txt"
import PROMPT_PROSECUTOR from "./prompt/prosecutor.txt"
import PROMPT_SUMMARY from "./prompt/summary.txt"
import PROMPT_TITLE from "./prompt/title.txt"
import { Permission } from "@/permission"
import { mergeDeep, pipe, sortBy, values } from "remeda"
import { Global } from "@fama-ai/core/global"
import path from "path"
import { Plugin } from "@/plugin"
import { Skill } from "../skill"
import { Effect, Context, Layer, Schema } from "effect"
import { InstanceState } from "@/effect/instance-state"
import * as Option from "effect/Option"
import * as OtelTracer from "@effect/opentelemetry/Tracer"
import { AbsolutePath, type DeepMutable } from "@fama-ai/core/schema"
import { ProviderV2 } from "@fama-ai/core/provider"
import { ModelV2 } from "@fama-ai/core/model"
import { LocationServiceMap } from "@fama-ai/core/location-layer"
import { PluginBoot } from "@fama-ai/core/plugin/boot"
import { Reference } from "@fama-ai/core/reference"
import { Location } from "@fama-ai/core/location"

export const Info = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),
  mode: Schema.Literals(["subagent", "primary", "all"]),
  native: Schema.optional(Schema.Boolean),
  hidden: Schema.optional(Schema.Boolean),
  topP: Schema.optional(Schema.Finite),
  temperature: Schema.optional(Schema.Finite),
  color: Schema.optional(Schema.String),
  permission: PermissionV1.Ruleset,
  model: Schema.optional(
    Schema.Struct({
      modelID: ModelV2.ID,
      providerID: ProviderV2.ID,
    }),
  ),
  variant: Schema.optional(Schema.String),
  prompt: Schema.optional(Schema.String),
  options: Schema.Record(Schema.String, Schema.Unknown),
  steps: Schema.optional(Schema.Finite),
}).annotate({ identifier: "Agent" })
export type Info = DeepMutable<Schema.Schema.Type<typeof Info>>

const GeneratedAgent = Schema.Struct({
  identifier: Schema.String,
  whenToUse: Schema.String,
  systemPrompt: Schema.String,
})

export interface Interface {
  readonly get: (agent: string) => Effect.Effect<Info>
  readonly list: () => Effect.Effect<Info[]>
  readonly defaultInfo: () => Effect.Effect<Info>
  readonly defaultAgent: () => Effect.Effect<string>
  readonly generate: (input: {
    description: string
    model?: { providerID: ProviderV2.ID; modelID: ModelV2.ID }
  }) => Effect.Effect<
    {
      identifier: string
      whenToUse: string
      systemPrompt: string
    },
    Provider.DefaultModelError
  >
}

type State = Omit<Interface, "generate">

// 合规护栏：法律角色（律师/法官/检察官/企业法务）在权限链中叠加的默认收紧规则。
// 只追加具体 deny/ask 模式，绝不覆盖 "*"，避免破坏 defaults 的白名单（外部目录、truncate 等）。
// evaluate 用 findLast，故晚于 defaults 合入的这些规则对命中模式生效；user 配置仍可显式放宽。
export const legalGuardrails = Permission.fromConfig({
  // 敏感凭证/密钥文件：默认拒绝读取，防止客户案卷数据依赖的凭据泄露
  read: {
    "**/.ssh/**": "deny",
    "**/.aws/**": "deny",
    "**/.gnupg/**": "deny",
    "**/id_rsa*": "deny",
    "**/id_ed25519*": "deny",
    "**/id_ecdsa*": "deny",
    "*.pem": "deny",
    "*.key": "deny",
    "*.keystore": "deny",
    "*.p12": "deny",
  },
  // 批量外发/网络回传类命令：默认询问，防止客户案卷数据未经确认外泄
  bash: {
    "curl *": "ask",
    "wget *": "ask",
    "scp *": "ask",
    "sftp *": "ask",
    "rsync *": "ask",
    "nc *": "ask",
  },
})

export class Service extends Context.Service<Service, Interface>()("@fama/Agent") {}

export const use = serviceUse(Service)

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const auth = yield* Auth.Service
    const plugin = yield* Plugin.Service
    const skill = yield* Skill.Service
    const provider = yield* Provider.Service
    const locations = yield* LocationServiceMap

    const state = yield* InstanceState.make<State>(
      Effect.fn("Agent.state")(function* (ctx) {
        const cfg = yield* config.get()
        const skillDirs = yield* skill.dirs()
        const referenceDirs = yield* Effect.gen(function* () {
          yield* (yield* PluginBoot.Service).wait()
          return (yield* (yield* Reference.Service).list()).map((reference) => reference.path)
        }).pipe(Effect.provide(locations.get(Location.Ref.make({ directory: AbsolutePath.make(ctx.directory) }))))
        const whitelistedDirs = [
          Truncate.GLOB,
          path.join(Global.Path.tmp, "*"),
          ...skillDirs.map((dir) => path.join(dir, "*")),
          ...referenceDirs.map((dir) => path.join(dir, "*")),
        ]
        const readonlyExternalDirectory = {
          "*": "ask",
          ...Object.fromEntries(whitelistedDirs.map((dir) => [dir, "allow"])),
        } satisfies Record<string, "allow" | "ask" | "deny">

        const defaults = Permission.fromConfig({
          "*": "allow",
          doom_loop: "ask",
          external_directory: {
            "*": "ask",
            ...Object.fromEntries(whitelistedDirs.map((dir) => [dir, "allow"])),
          },
          question: "deny",
          plan_enter: "deny",
          plan_exit: "deny",
          // mirrors github.com/github/gitignore Node.gitignore pattern for .env files
          read: {
            "*": "allow",
            "*.env": "ask",
            "*.env.*": "ask",
            "*.env.example": "allow",
          },
        })

        const user = Permission.fromConfig(cfg.permission ?? {})

        const agents: Record<string, Info> = {
          build: {
            name: "build",
            description: "The default agent. Executes tools based on configured permissions.",
            options: {},
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                question: "allow",
                plan_enter: "allow",
              }),
              user,
            ),
            mode: "primary",
            native: true,
          },
          plan: {
            name: "plan",
            description: "Plan mode. Disallows all edit tools.",
            options: {},
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                question: "allow",
                plan_exit: "allow",
                task: {
                  general: "deny",
                },
                external_directory: {
                  [path.join(Global.Path.data, "plans", "*")]: "allow",
                },
                edit: {
                  "*": "deny",
                  [path.join(".fama", "plans", "*.md")]: "allow",
                  [path.relative(ctx.worktree, path.join(Global.Path.data, path.join("plans", "*.md")))]: "allow",
                },
              }),
              user,
            ),
            mode: "primary",
            native: true,
          },
          general: {
            name: "general",
            description: `General-purpose agent for researching complex questions and executing multi-step tasks. Use this agent to execute multiple units of work in parallel.`,
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                todowrite: "deny",
              }),
              user,
            ),
            options: {},
            mode: "subagent",
            native: true,
          },
          // 面向法律职业共同体（律师、法官、检察官等）的中文法律实务助手。
          // 全功能 primary agent，可读可写、可联网检索现行法规案例，系统提示负责法律行为约束。
          lawyer: {
            name: "lawyer",
            description: `面向律师的中文法律实务助手。擅长合同与文书审查、法条检索释义、案件事实分析、法律文书起草与风险提示。引用法律须注明全称与条文，严禁编造条文或案例。`,
            options: {},
            color: "#b91c1c",
            prompt: PROMPT_LAWYER,
            permission: Permission.merge(
              defaults,
              legalGuardrails,
              Permission.fromConfig({
                question: "allow",
              }),
              user,
            ),
            mode: "primary",
            native: true,
          },
          // 面向审判人员的居中裁判辅助助手（民事/刑事/行政审判全流程）。
          judge: {
            name: "judge",
            description: `面向法官的审判辅助助手。居中裁判、不偏不倚，擅长证据审查、争议焦点归纳、释明、裁判文书起草与说理。以事实为根据、以法律为准绳，严禁编造条文或案例。`,
            options: {},
            color: "#1e40af",
            prompt: PROMPT_JUDGE,
            permission: Permission.merge(
              defaults,
              legalGuardrails,
              Permission.fromConfig({
                question: "allow",
              }),
              user,
            ),
            mode: "primary",
            native: true,
          },
          // 面向检察官的办案辅助助手（刑事公诉、法律监督、公益诉讼）。
          prosecutor: {
            name: "prosecutor",
            description: `面向检察官的办案辅助助手。擅长审查起诉与不起诉判断、量刑建议、出庭支持公诉、侦查/审判/执行监督与公益诉讼。秉持客观义务，兼顾对被告人有利与不利证据，严禁编造条文或案例。`,
            options: {},
            color: "#0f766e",
            prompt: PROMPT_PROSECUTOR,
            permission: Permission.merge(
              defaults,
              legalGuardrails,
              Permission.fromConfig({
                question: "allow",
              }),
              user,
            ),
            mode: "primary",
            native: true,
          },
          // 面向企业法务与合规人员的法务合规助手（合同审查、合规体系、监管规则释义、尽调培训）。
          counsel: {
            name: "counsel",
            description: `面向企业法务与合规人员的法务合规助手。擅长合同与交易审查、合规体系建设（反腐败/反垄断/数据合规/出口管制等）、监管规则检索释义、合规尽调与培训。区分法律/监管/惯例/内部制度，严禁编造，给出可执行建议。`,
            options: {},
            color: "#7c3aed",
            prompt: PROMPT_COUNSEL,
            permission: Permission.merge(
              defaults,
              legalGuardrails,
              Permission.fromConfig({
                question: "allow",
              }),
              user,
            ),
            mode: "primary",
            native: true,
          },
          explore: {
            name: "explore",
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                "*": "deny",
                grep: "allow",
                glob: "allow",
                list: "allow",
                bash: "allow",
                webfetch: "allow",
                websearch: "allow",
                read: "allow",
                external_directory: readonlyExternalDirectory,
              }),
              user,
            ),
            description: `Fast agent specialized for exploring codebases. Use this when you need to quickly find files by patterns (eg. "src/components/**/*.tsx"), search code for keywords (eg. "API endpoints"), or answer questions about the codebase (eg. "how do API endpoints work?"). When calling this agent, specify the desired thoroughness level: "quick" for basic searches, "medium" for moderate exploration, or "very thorough" for comprehensive analysis across multiple locations and naming conventions.`,
            prompt: PROMPT_EXPLORE,
            options: {},
            mode: "subagent",
            native: true,
          },
          compaction: {
            name: "compaction",
            mode: "primary",
            native: true,
            hidden: true,
            prompt: PROMPT_COMPACTION,
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                "*": "deny",
              }),
              user,
            ),
            options: {},
          },
          title: {
            name: "title",
            mode: "primary",
            options: {},
            native: true,
            hidden: true,
            temperature: 0.5,
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                "*": "deny",
              }),
              user,
            ),
            prompt: PROMPT_TITLE,
          },
          summary: {
            name: "summary",
            mode: "primary",
            options: {},
            native: true,
            hidden: true,
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                "*": "deny",
              }),
              user,
            ),
            prompt: PROMPT_SUMMARY,
          },
        }

        for (const [key, value] of Object.entries(cfg.agent ?? {})) {
          if (value.disable) {
            delete agents[key]
            continue
          }
          let item = agents[key]
          if (!item)
            item = agents[key] = {
              name: key,
              mode: "all",
              permission: Permission.merge(defaults, user),
              options: {},
              native: false,
            }
          if (value.model) item.model = Provider.parseModel(value.model)
          item.variant = value.variant ?? item.variant
          item.prompt = value.prompt ?? item.prompt
          item.description = value.description ?? item.description
          item.temperature = value.temperature ?? item.temperature
          item.topP = value.top_p ?? item.topP
          item.mode = value.mode ?? item.mode
          item.color = value.color ?? item.color
          item.hidden = value.hidden ?? item.hidden
          item.name = value.name ?? item.name
          item.steps = value.steps ?? item.steps
          item.options = mergeDeep(item.options, value.options ?? {})
          item.permission = Permission.merge(item.permission, Permission.fromConfig(value.permission ?? {}))
        }

        // Ensure Truncate.GLOB is allowed unless explicitly configured
        for (const name in agents) {
          const agent = agents[name]
          const explicit = agent.permission.some((r) => {
            if (r.permission !== "external_directory") return false
            if (r.action !== "deny") return false
            return r.pattern === Truncate.GLOB
          })
          if (explicit) continue

          agents[name].permission = Permission.merge(
            agents[name].permission,
            Permission.fromConfig({ external_directory: { [Truncate.GLOB]: "allow" } }),
          )
        }

        const get = Effect.fnUntraced(function* (agent: string) {
          return agents[agent]
        })

        const list = Effect.fnUntraced(function* () {
          const cfg = yield* config.get()
          return pipe(
            agents,
            values(),
            sortBy(
              [(x) => (cfg.default_agent ? x.name === cfg.default_agent : x.name === "build"), "desc"],
              [(x) => x.name, "asc"],
            ),
          )
        })

        const defaultInfo = Effect.fnUntraced(function* () {
          const c = yield* config.get()
          if (c.default_agent) {
            const agent = agents[c.default_agent]
            if (!agent) throw new Error(`default agent "${c.default_agent}" not found`)
            if (agent.mode === "subagent") throw new Error(`default agent "${c.default_agent}" is a subagent`)
            if (agent.hidden === true) throw new Error(`default agent "${c.default_agent}" is hidden`)
            return agent
          }
          const visible = Object.values(agents).find((a) => a.mode !== "subagent" && a.hidden !== true)
          if (!visible) throw new Error("no primary visible agent found")
          return visible
        })

        const defaultAgent = Effect.fnUntraced(function* () {
          return (yield* defaultInfo()).name
        })

        return {
          get,
          list,
          defaultInfo,
          defaultAgent,
        } satisfies State
      }),
    )

    return Service.of({
      get: Effect.fn("Agent.get")(function* (agent: string) {
        return yield* InstanceState.useEffect(state, (s) => s.get(agent))
      }),
      list: Effect.fn("Agent.list")(function* () {
        return yield* InstanceState.useEffect(state, (s) => s.list())
      }),
      defaultInfo: Effect.fn("Agent.defaultInfo")(function* () {
        return yield* InstanceState.useEffect(state, (s) => s.defaultInfo())
      }),
      defaultAgent: Effect.fn("Agent.defaultAgent")(function* () {
        return yield* InstanceState.useEffect(state, (s) => s.defaultAgent())
      }),
      generate: Effect.fn("Agent.generate")(function* (input: {
        description: string
        model?: { providerID: ProviderV2.ID; modelID: ModelV2.ID }
      }) {
        const cfg = yield* config.get()
        const model = input.model ?? (yield* provider.defaultModel())
        const resolved = yield* provider.getModel(model.providerID, model.modelID)
        const language = yield* provider.getLanguage(resolved)
        const tracer = cfg.experimental?.openTelemetry
          ? Option.getOrUndefined(yield* Effect.serviceOption(OtelTracer.OtelTracer))
          : undefined

        const system = [PROMPT_GENERATE]
        yield* plugin.trigger("experimental.chat.system.transform", { model: resolved }, { system })
        const existing = yield* InstanceState.useEffect(state, (s) => s.list())

        // TODO: clean this up so provider specific logic doesnt bleed over
        const authInfo = yield* auth.get(model.providerID).pipe(Effect.orDie)
        const isOpenaiOauth = model.providerID === "openai" && authInfo?.type === "oauth"

        const params = {
          experimental_telemetry: {
            isEnabled: cfg.experimental?.openTelemetry,
            tracer,
            metadata: {
              userId: cfg.username ?? "unknown",
            },
          },
          temperature: 0.3,
          messages: [
            ...(isOpenaiOauth
              ? []
              : system.map(
                  (item): ModelMessage => ({
                    role: "system",
                    content: item,
                  }),
                )),
            {
              role: "user",
              content: `Create an agent configuration based on this request: "${input.description}".\n\nIMPORTANT: The following identifiers already exist and must NOT be used: ${existing.map((i) => i.name).join(", ")}\n  Return ONLY the JSON object, no other text, do not wrap in backticks`,
            },
          ],
          model: language,
          schema: Object.assign(
            Schema.toStandardSchemaV1(GeneratedAgent),
            Schema.toStandardJSONSchemaV1(GeneratedAgent),
          ),
        } satisfies Parameters<typeof generateObject>[0]

        if (isOpenaiOauth) {
          return yield* Effect.promise(async () => {
            const result = streamObject({
              ...params,
              providerOptions: ProviderTransform.providerOptions(resolved, {
                instructions: system.join("\n"),
                store: false,
              }),
              onError: () => {},
            })
            for await (const part of result.fullStream) {
              if (part.type === "error") throw part.error
            }
            return result.object
          })
        }

        return yield* Effect.promise(() => generateObject(params).then((r) => r.object))
      }),
    })
  }),
)

export const defaultLayer = layer.pipe(
  Layer.provide(Plugin.defaultLayer),
  Layer.provide(Provider.defaultLayer),
  Layer.provide(Auth.defaultLayer),
  Layer.provide(Config.defaultLayer),
  Layer.provide(Skill.defaultLayer),
  Layer.provide(LocationServiceMap.layer),
)

const locationServiceMapNode = LayerNode.make(LocationServiceMap.layer, [])

export const node = LayerNode.make(layer, [
  Config.node,
  Auth.node,
  Plugin.node,
  Skill.node,
  Provider.node,
  locationServiceMapNode,
])

export * as Agent from "./agent"
