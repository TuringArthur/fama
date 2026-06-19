import { Effect, Schema } from "effect"
import path from "path"
import { EOL } from "os"
import { FSUtil } from "@fama-ai/core/fs-util"
import { parseMappingTable, restore, restoredCopyName } from "@fama-ai/core/redact"
import { effectCmd, fail } from "../effect-cmd"

// `fama restore` —— 脱密的逆操作：把含占位符（[姓名1]…）的文本按「对照表」换回真实值。
// 典型用于：脱密副本上传给 AI 处理后，把 AI 返回结果里的占位符还原。
//
// 使用示例：
//   fama restore 分析.txt -m 起诉状.脱密.docx.对照表.json
//   fama restore 结果/ -m 对照表.json -o 还原/
//   fama restore 分析.txt -m 对照表.json --dryRun

const READABLE_EXT = [".txt", ".md", ".markdown", ".text"]

const RestoreArgsSchema = Schema.Struct({
  input: Schema.Array(Schema.String),
  map: Schema.String,
  outputDir: Schema.optional(Schema.String),
  dryRun: Schema.optional(Schema.Boolean),
})

type RestoreArgs = Schema.Schema.Type<typeof RestoreArgsSchema>

function decodeArgs(args: RestoreArgs) {
  return Schema.decodeUnknownSync(RestoreArgsSchema)(args)
}

export const RestoreCommand = effectCmd({
  command: "restore <input..>",
  aliases: ["unmask", "还原"],
  describe: "按对照表解除脱密：把 [姓名1] 等占位符还原为真实值（脱密的逆操作）",
  instance: false,
  builder: (yargs) =>
    yargs
      .positional("input", {
        type: "string",
        array: true,
        describe: "待还原的文件/目录（.txt/.md/.markdown/.text）",
      })
      .option("map", {
        alias: "m",
        describe: "对照表文件（fama redact 生成的 .json；也兼容旧版 .md 表格）",
        type: "string",
        demandOption: true,
      })
      .option("outputDir", {
        alias: "o",
        describe: "还原副本输出目录；缺省写到每个源文件同目录或 ./还原副本/",
        type: "string",
      })
      .option("dryRun", {
        alias: "n",
        describe: "只预览还原结果，不写出文件",
        type: "boolean",
        default: false,
      }),
  handler: Effect.fn("Cli.restore")(function* (args) {
    const a = decodeArgs(args)
    return yield* run(a)
  }),
})

type Processed = {
  source: string
  outputPath?: string
  restored: string
  replaced: number
}

const run = Effect.fn("Cli.restore.body")(function* (args: RestoreArgs) {
  const fs = yield* FSUtil.Service
  const dryRun = args.dryRun === true

  // 读取并解析对照表（优先 JSON，兼容旧版 Markdown 表格）。
  const rawMap = yield* fs.readFileStringSafe(args.map).pipe(Effect.orDie)
  const mapping = parseMappingTable(rawMap ?? "")
  if (!mapping.length) {
    yield* fail(`对照表为空或无法解析：${args.map}`)
    return
  }

  // 收集待还原文件：展开目录、过滤可读扩展名。
  const files: string[] = []
  for (const input of args.input) {
    const isDir = yield* fs.isDir(input).pipe(Effect.orDie)
    if (isDir) {
      const entries = yield* fs.readDirectoryEntries(input).pipe(Effect.orDie)
      for (const e of entries) {
        if (e.type !== "file") continue
        if (!READABLE_EXT.includes(path.extname(e.name).toLowerCase())) continue
        files.push(path.join(input, e.name))
      }
    } else {
      files.push(input)
    }
  }

  if (files.length === 0) {
    yield* fail("未找到可还原的文件（支持 .txt/.md/.markdown/.text，或指定目录）")
    return
  }

  const outDir = resolveOutDir(args)
  if (outDir) yield* fs.ensureDir(outDir).pipe(Effect.orDie)

  const processed: Processed[] = []
  for (const file of files) {
    const text = yield* fs.readFileStringSafe(file).pipe(Effect.orDie)
    const source = text ?? ""
    const restored = restore(source, mapping)
    const replaced = countReplaced(source, restored, mapping)

    let outputPath: string | undefined
    if (!dryRun) {
      const dir = outDir ?? path.dirname(file)
      outputPath = path.join(dir, restoredCopyName(path.basename(file)))
      yield* fs.writeWithDirs(outputPath, restoredHeader(file) + restored).pipe(Effect.orDie)
    }

    processed.push({ source: file, outputPath, restored, replaced })
  }

  report(processed, dryRun, mapping.length)
})

function resolveOutDir(args: RestoreArgs): string | undefined {
  if (args.outputDir) return args.outputDir
  return args.input.length > 1 ? "还原副本" : undefined
}

// 统计实际被替换的占位符次数（还原前后差异 / mapping 命中），用于报告。
function countReplaced(original: string, restored: string, mapping: { token: string }[]): number {
  let total = 0
  for (const m of mapping) {
    const before = original.split(m.token).length - 1
    const after = restored.split(m.token).length - 1
    total += Math.max(0, before - after)
  }
  return total
}

function restoredHeader(source: string): string {
  return [
    `# 解除脱密还原副本`,
    ``,
    `> 源文件：${path.basename(source)}`,
    `> 本副本由 Fama 解除脱密工具生成，已按对照表还原占位符。`,
    ``,
    `---`,
    ``,
  ].join("\n")
}

function report(processed: Processed[], dryRun: boolean, mappingCount: number) {
  const out = process.stderr
  const label = dryRun ? "解除脱密预览（dry-run，未写出文件）" : "解除脱密完成"
  out.write(`=== ${label} ===${EOL}`)
  out.write(`对照表：${mappingCount} 条${EOL}`)

  let totalReplaced = 0
  for (const p of processed) {
    totalReplaced += p.replaced
    out.write(`${EOL}${path.basename(p.source)}${EOL}`)
    out.write(`还原 ${p.replaced} 处占位符${EOL}`)
    if (p.outputPath) out.write(`还原副本：${p.outputPath}${EOL}`)
  }

  out.write(`${EOL}合计 ${processed.length} 个文件，还原 ${totalReplaced} 处占位符。${EOL}`)
}
