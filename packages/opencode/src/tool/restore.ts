import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import DESCRIPTION from "./restore.txt"
import { FSUtil } from "@fama-ai/core/fs-util"
import { parseMappingTable, restore, restoredCopyName, type MappingEntry } from "@fama-ai/core/redact"
import { basename, dirname, join } from "path"

// 解除脱密工具的 opencode 适配层。
// 脱密的逆操作：把含占位符（[姓名1]…）的文本按对照表（fama redact 生成的 .json）换回真实值。
// 常用于把 AI 处理脱密副本后返回结果里的占位符还原。

export { restore, restoredCopyName }
export type { MappingEntry }

export const Parameters = Schema.Struct({
  text: Schema.optional(Schema.String).annotate({
    description: "待还原的文本（含 [姓名1] 等占位符，与 filePath 二选一）",
  }),
  filePath: Schema.optional(Schema.String).annotate({
    description: "待还原文件的绝对路径（.txt/.md，行内文本优先），与 text 二选一",
  }),
  mapPath: Schema.String.annotate({
    description: "对照表文件路径（fama redact 生成的 .json；也兼容旧版 .md 表格），必填",
  }),
  outputDir: Schema.optional(Schema.String).annotate({
    description: "还原副本输出目录；缺省写入源文件同目录",
  }),
  writeCopy: Schema.optional(Schema.Boolean).annotate({
    description: "是否写出还原副本文件（默认 true）",
  }),
})

export const RestoreTool = Tool.define(
  "restore",
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          if (!params.text && !params.filePath) throw new Error("text 与 filePath 至少提供一个")
          if (!params.mapPath) throw new Error("mapPath（对照表文件）为必填项")

          yield* ctx.ask({
            permission: "read",
            patterns: [params.mapPath, ...(params.filePath ? [params.filePath] : [])],
            always: ["*"],
            metadata: { source: params.filePath ? "file" : "inline", mapPath: params.mapPath },
          })

          const rawMap = yield* fs.readFileStringSafe(params.mapPath).pipe(Effect.orDie)
          const mapping = parseMappingTable(rawMap ?? "")
          if (!mapping.length) {
            return {
              output: `对照表为空或无法解析：${params.mapPath}`,
              title: "解除脱密",
              metadata: { source: params.filePath ? "file" : "inline", mapping: 0, replaced: 0, outputPath: undefined },
            }
          }

          const loaded = params.text ?? (yield* fs.readFileStringSafe(params.filePath!).pipe(Effect.orDie))
          const source = loaded ?? ""
          if (!source.trim()) {
            return {
              output: "提供的文本为空，无需解除脱密。",
              title: "解除脱密",
              metadata: { source: params.filePath ? "file" : "inline", mapping: mapping.length, replaced: 0, outputPath: undefined },
            }
          }

          const restored = restore(source, mapping)
          const replaced = mapping.reduce((sum, m) => sum + Math.max(0, source.split(m.token).length - 1 - (restored.split(m.token).length - 1)), 0)
          yield* ctx.metadata({ title: `解除脱密（还原 ${replaced} 处占位符）` })

          let outputPath: string | undefined
          if (params.writeCopy !== false) {
            const src = params.filePath ?? join(process.cwd(), "AI处理结果.txt")
            const dir = params.outputDir ?? dirname(src)
            outputPath = join(dir, restoredCopyName(basename(src)))
            const header = [
              `# 解除脱密还原副本`,
              ``,
              `> 本副本由 Fama 解除脱密工具生成，已按对照表还原占位符。`,
              ``,
              `---`,
              ``,
            ].join("\n")
            yield* fs.writeWithDirs(outputPath, header + restored)
          }

          const output = [
            `解除脱密完成：对照表 ${mapping.length} 条，还原 ${replaced} 处占位符。`,
            ...(outputPath ? [``, `还原副本已写入：${outputPath}`] : []),
          ].join("\n")

          return {
            output,
            title: "解除脱密",
            metadata: {
              source: params.filePath ? "file" : "inline",
              mapping: mapping.length,
              replaced,
              outputPath,
            },
          }
        }).pipe(Effect.orDie),
    }
  }),
)
