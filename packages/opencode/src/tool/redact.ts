import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import DESCRIPTION from "./redact.txt"
import { FSUtil } from "@fama-ai/core/fs-util"
import {
  type Category,
  type Finding,
  type MappingEntry,
  type RedactionOptions,
  type RedactionResult,
  CATEGORY_LABELS,
  buildMapping,
  detect,
  emptyScopeHits,
  redact,
  redactedCopyName,
  summarize,
} from "@fama-ai/core/redact"
import { basename, dirname, extname, join } from "path"

// 案件脱密工具的 opencode 适配层。
// 脱密「可验证核心」（detect / redact / buildMapping / summarize）位于
// `@fama-ai/core/redact`，与桌面端脱密对话框共用同一份实现；本文件只负责
// Effect Tool 包装（权限、文件读写、写出脱密副本与对照表）。

export type { Category, Finding, MappingEntry, RedactionOptions, RedactionResult }
export { CATEGORY_LABELS, detect, redact, buildMapping, summarize, redactedCopyName }

export const Parameters = Schema.Struct({
  text: Schema.optional(Schema.String).annotate({
    description: "待脱密的案件文本（与 filePath 二选一）",
  }),
  filePath: Schema.optional(Schema.String).annotate({
    description: "案件文件的绝对路径（.txt/.md，行内文本优先），与 text 二选一",
  }),
  outputDir: Schema.optional(Schema.String).annotate({
    description: "脱密副本输出目录；缺省写入源文件同目录",
  }),
  categories: Schema.optional(Schema.Array(Schema.String)).annotate({
    description: `仅脱敏指定类别，如 ["idCard","phone"]。可选值：${Object.entries(CATEGORY_LABELS)
      .map(([k, v]) => `${k}(${v})`)
      .join(", ")}`,
  }),
  writeCopy: Schema.optional(Schema.Boolean).annotate({
    description: "是否写出脱密副本文件（默认 true）",
  }),
})

function parseCategories(input: readonly string[] | undefined): Category[] | undefined {
  if (!input?.length) return undefined
  const valid = new Set<string>(Object.keys(CATEGORY_LABELS))
  return input.filter((c): c is Category => valid.has(c))
}

export const RedactTool = Tool.define(
  "redact",
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          if (!params.text && !params.filePath) throw new Error("text 与 filePath 至少提供一个")

          yield* ctx.ask({
            permission: params.filePath ? "read" : "redact",
            patterns: params.filePath ? [params.filePath] : [],
            always: ["*"],
            metadata: { source: params.filePath ? "file" : "inline", categories: params.categories },
          })

          const loaded = params.text ?? (yield* fs.readFileStringSafe(params.filePath!).pipe(Effect.orDie))
          const text = loaded ?? ""
          if (!text.trim()) {
            return {
              output: "提供的案件文本为空，无需脱密。",
              title: "案件脱密",
              metadata: {
                source: params.filePath ? "file" : "inline",
                findings: 0,
                mapping: 0,
                scopeHits: emptyScopeHits(),
                outputPath: undefined,
                mapPath: undefined,
              },
            }
          }

          const result = redact(text, { categories: parseCategories(params.categories) })
          yield* ctx.metadata({ title: `案件脱密（命中 ${result.findings.length} 处）` })

          // 写出脱密副本（源文件不动）。对照表作为独立文件本地保留，提醒用户勿随副本上传。
          let outputPath: string | undefined
          let mapPath: string | undefined
          if (params.writeCopy !== false) {
            const src = params.filePath ?? join(process.cwd(), "案件.txt")
            const dir = params.outputDir ?? dirname(src)
            outputPath = join(dir, redactedCopyName(basename(src)))
            mapPath = join(dir, `${basename(outputPath, extname(outputPath))}.对照表.md`)
            const header = [
              `# 案件脱密副本`,
              ``,
              `> 本副本由 Fama 脱密工具生成，已去除敏感信息，可安全上传到 AI 平台协同处理。`,
              ``,
              `---`,
              ``,
            ].join("\n")
            yield* fs.writeWithDirs(outputPath, header + result.redacted)
            if (result.mapping.length) {
              const mapBody = [
                `# 脱密占位对照表`,
                ``,
                `> ⚠️ 本表记录脱密前后的对应关系，属敏感信息，请妥善保管，切勿随脱密副本一起上传。`,
                ``,
                `| 占位符 | 类别 | 原始值 |`,
                `| --- | --- | --- |`,
                ...result.mapping.map((m) => `| ${m.token} | ${CATEGORY_LABELS[m.category]} | ${m.value} |`),
              ].join("\n")
              yield* fs.writeWithDirs(mapPath, mapBody)
            }
          }

          const output = [
            summarize(result),
            ...(outputPath ? ["", `脱密副本已写入：${outputPath}`] : []),
            ...(mapPath && result.mapping.length ? [`对照表（本地保留）：${mapPath}`] : []),
          ].join("\n")

          return {
            output,
            title: "案件脱密",
            metadata: {
              source: params.filePath ? "file" : "inline",
              findings: result.findings.length,
              mapping: result.mapping.length,
              scopeHits: result.scopeHits,
              outputPath,
              mapPath,
            },
          }
        }).pipe(Effect.orDie),
    }
  }),
)
