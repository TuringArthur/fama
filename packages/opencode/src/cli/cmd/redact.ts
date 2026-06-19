import { Effect, Schema } from "effect"
import path from "path"
import { EOL } from "os"
import { FSUtil } from "@fama-ai/core/fs-util"
import {
  type Category,
  type RedactionResult,
  CATEGORY_LABELS,
  redact,
  redactedCopyName,
  summarize,
} from "@fama-ai/core/redact"
import { effectCmd, fail } from "../effect-cmd"

// `fama redact` —— 一键把案件材料（文件/目录）批量生成「脱密副本」。
// 处理纯本地完成、不上传任何内容；对律师/法官/检察官等保密敏感用户友好。
//
// 使用示例：
//   fama redact 起诉状.txt
//   fama redact 案件材料/ -o 脱密副本/
//   fama redact 起诉状.txt --only idCard,phone,name

const READABLE_EXT = [".txt", ".md", ".markdown", ".text"]

function parseCategories(raw: string | undefined): Category[] | undefined {
  if (!raw) return undefined
  const valid = new Set(Object.keys(CATEGORY_LABELS))
  const parsed = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is Category => valid.has(s))
  return parsed.length ? parsed : undefined
}

function decodeArgs(args: RedactArgs) {
  return Schema.decodeUnknownSync(RedactArgsSchema)(args)
}

const RedactArgsSchema = Schema.Struct({
  input: Schema.Array(Schema.String),
  outputDir: Schema.optional(Schema.String),
  only: Schema.optional(Schema.String),
  dryRun: Schema.optional(Schema.Boolean),
})

type RedactArgs = Schema.Schema.Type<typeof RedactArgsSchema>

export const RedactCommand = effectCmd({
  command: "redact <input..>",
  aliases: ["mask", "脱密"],
  describe: "一键把案件材料生成脱密副本（去除姓名/身份证号/手机号/银行卡号/地址/涉密标记等敏感信息）",
  instance: false,
  builder: (yargs) =>
    yargs
      .positional("input", {
        describe: "待脱密的案件文件或目录（可多个）",
        type: "string",
        array: true,
        demandOption: true,
      })
      .option("outputDir", {
        alias: "o",
        describe: "脱密副本输出目录；缺省写到每个源文件同目录或 ./脱密副本/",
        type: "string",
      })
      .option("only", {
        describe: `仅脱敏指定类别（逗号分隔），如 idCard,phone,name。可选：${Object.keys(CATEGORY_LABELS).join(",")}`,
        type: "string",
      })
      .option("dryRun", {
        alias: "n",
        describe: "只检测与预览，不写出脱密副本文件",
        type: "boolean",
        default: false,
      }),
  handler: Effect.fn("Cli.redact")(function* (args) {
    const a = decodeArgs(args)
    return yield* run(a)
  }),
})

type Processed = {
  source: string
  outputPath?: string
  mapPath?: string
  result: RedactionResult
}

const run = Effect.fn("Cli.redact.body")(function* (args: RedactArgs) {
  const fs = yield* FSUtil.Service
  const categories = parseCategories(args.only)
  const dryRun = args.dryRun === true

  // 收集待处理文件：展开目录、过滤可读扩展名。
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
    yield* fail("未找到可脱密的文件（支持 .txt/.md/.markdown/.text，或指定目录）")
    return
  }

  // 输出目录：显式给定优先；否则批量或目录输入时汇总到 ./脱密副本/，单文件则就地写。
  const outDir = yield* resolveOutDir(fs, args)
  if (outDir) yield* fs.ensureDir(outDir).pipe(Effect.orDie)

  const processed: Processed[] = []
  for (const file of files) {
    const text = yield* fs.readFileStringSafe(file).pipe(Effect.orDie)
    if (!text?.trim()) {
      processed.push({ source: file, result: emptyResult() })
      continue
    }
    const result = redact(text, { categories })

    let outputPath: string | undefined
    let mapPath: string | undefined
    if (!dryRun) {
      const dir = outDir ?? path.dirname(file)
      outputPath = path.join(dir, redactedCopyName(path.basename(file)))
      const header = redactionHeader(file)
      yield* fs.writeWithDirs(outputPath, header + result.redacted).pipe(Effect.orDie)
      if (result.mapping.length) {
        mapPath = path.join(dir, `${path.basename(outputPath, path.extname(outputPath))}.对照表.md`)
        yield* fs.writeWithDirs(mapPath, mappingBody(result)).pipe(Effect.orDie)
      }
    }

    processed.push({ source: file, outputPath, mapPath, result })
  }

  report(processed, dryRun)
})

function resolveOutDir(fs: FSUtil.Interface, args: RedactArgs): Effect.Effect<string | undefined> {
  return Effect.gen(function* () {
    if (args.outputDir) return args.outputDir
    if (filesNeedFolder(args)) return "脱密副本"
    const inputIsDir = yield* fs.isDir(args.input[0]!).pipe(Effect.orDie)
    return inputIsDir ? "脱密副本" : undefined
  })
}

function filesNeedFolder(args: RedactArgs): boolean {
  return args.input.length > 1
}

function emptyResult(): RedactionResult {
  return {
    redacted: "",
    findings: [],
    mapping: [],
    stats: {},
    scopeHits: { nationalSecret: false, commercialSecret: false, personalPrivacy: false },
  }
}

function redactionHeader(source: string): string {
  return [
    `# 案件脱密副本`,
    ``,
    `> 源文件：${path.basename(source)}`,
    `> 本副本由 Fama 脱密工具生成，已去除敏感信息，可安全上传到 AI 平台协同处理。`,
    ``,
    `---`,
    ``,
  ].join("\n")
}

function mappingBody(result: RedactionResult): string {
  return [
    `# 脱密占位对照表`,
    ``,
    `> ⚠️ 本表记录脱密前后的对应关系，属敏感信息，请妥善保管，切勿随脱密副本一起上传。`,
    ``,
    `| 占位符 | 类别 | 原始值 |`,
    `| --- | --- | --- |`,
    ...result.mapping.map((m) => `| ${m.token} | ${CATEGORY_LABELS[m.category]} | ${m.value} |`),
  ].join("\n")
}

function report(processed: Processed[], dryRun: boolean) {
  const out = process.stderr
  const label = dryRun ? "脱密预览（dry-run，未写出文件）" : "脱密完成"
  out.write(`=== ${label} ===${EOL}`)

  let totalFindings = 0
  let totalMapping = 0
  for (const p of processed) {
    totalFindings += p.result.findings.length
    totalMapping += p.result.mapping.length
    out.write(`${EOL}${path.basename(p.source)}${EOL}`)
    out.write(`${summarize(p.result)}${EOL}`)
    if (p.outputPath) out.write(`脱密副本：${p.outputPath}${EOL}`)
    if (p.mapPath && p.result.mapping.length) out.write(`对照表（本地保留）：${p.mapPath}${EOL}`)
  }

  out.write(`${EOL}合计 ${processed.length} 个文件，命中 ${totalFindings} 处，覆盖 ${totalMapping} 个不同主体/信息。${EOL}`)

  const anySecret = processed.some(
    (p) => p.result.scopeHits.nationalSecret || p.result.scopeHits.commercialSecret || p.result.scopeHits.personalPrivacy,
  )
  if (anySecret) {
    out.write(
      `${EOL}⚠️ 检出涉敏感信息。正式上传前请人工复核脱密副本；涉及国家秘密的须遵守《保守国家秘密法》，必要时不得上传至任何外部平台。${EOL}`,
    )
  }
}
