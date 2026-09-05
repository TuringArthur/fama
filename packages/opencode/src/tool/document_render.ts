import { Document, Packer, Paragraph, TextRun, AlignmentType, LineRuleType } from "docx"
import { Effect, Schema } from "effect"
import path from "path"
import * as Tool from "./tool"
import DESCRIPTION from "./document_render.txt"
import { InstanceState } from "@/effect/instance-state"

// 文书渲染：把轻量 Markdown 内容按法律文书版式（公文 GB/T 9704 / 诉讼文书 /
// 普通）渲染为 .docx（docx-js，纯 JS），同时输出打印友好 HTML（浏览器打印即 PDF）。

const AI_LABEL = "本文由人工智能辅助生成，供参考，不构成法律意见。"

type FormatName = "official" | "litigation" | "plain"

type Spec = {
  pageMargin: { top: number; bottom: number; left: number; right: number }
  titleSize: number
  titleFont: string
  bodySize: number
  bodyFont: string
  h1Font: string
  h2Font: string
  lineTwips: number
  lineRule: (typeof LineRuleType)["EXACT" | "AUTO"]
  firstLineIndent: number
}

// GB/T 9704-2012：上37/下35/左28/右26 mm（1mm≈56.7twip），三号=16pt(32 half)，二号=22pt(44 half)
const OFFICIAL: Spec = {
  pageMargin: { top: 2098, bottom: 1984, left: 1587, right: 1474 },
  titleSize: 44,
  titleFont: "宋体",
  bodySize: 32,
  bodyFont: "仿宋",
  h1Font: "黑体",
  h2Font: "楷体",
  lineTwips: 560,
  lineRule: LineRuleType.EXACT,
  firstLineIndent: 640,
}

const LITIGATION: Spec = { ...OFFICIAL, titleFont: "宋体" }

const PLAIN: Spec = {
  pageMargin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
  titleSize: 32,
  titleFont: "宋体",
  bodySize: 24,
  bodyFont: "宋体",
  h1Font: "黑体",
  h2Font: "黑体",
  lineTwips: 360,
  lineRule: LineRuleType.AUTO,
  firstLineIndent: 0,
}

const SPECS: Record<FormatName, Spec> = { official: OFFICIAL, litigation: LITIGATION, plain: PLAIN }

export const Parameters = Schema.Struct({
  title: Schema.String.annotate({ description: "文书标题，如「民事起诉状」" }),
  content: Schema.String.annotate({
    description:
      "正文，轻量 Markdown：## 一级标题（黑体）、### 二级标题（楷体）、段落直接书写、- 无序列表、1. 有序列表、**加粗**",
  }),
  filename: Schema.String.annotate({ description: "输出文件名（不含路径），如「民事起诉状-张三诉李四.docx」" }),
  format: Schema.optional(Schema.String).annotate({
    description: "版式：official（公文 GB/T 9704，默认）、litigation（诉讼文书）、plain（普通文档）",
  }),
  aiLabel: Schema.optional(Schema.Boolean).annotate({
    description: "是否在文末追加 AI 生成标识，默认 true",
  }),
})

// ---- 轻量 Markdown 解析（pure，便于单测）----

type Block =
  | { kind: "h1" | "h2" | "h3" | "p"; text: string }
  | { kind: "li"; text: string; ordered: boolean }

/** 解析行级结构：标题/列表/段落；行内 **加粗** 在渲染时拆分 runs。 */
export function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = []
  let paragraph: string[] = []

  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: "p", text: paragraph.join("\n") })
      paragraph = []
    }
  }

  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trimEnd()
    if (!line.trim()) {
      flush()
      continue
    }
    const heading = line.match(/^(#{1,3})\s+(.*)$/)
    if (heading) {
      flush()
      const level = heading[1]!.length
      blocks.push({ kind: level === 1 ? "h1" : level === 2 ? "h2" : "h3", text: heading[2]!.trim() })
      continue
    }
    const unordered = line.match(/^[-•]\s+(.*)$/)
    if (unordered) {
      flush()
      blocks.push({ kind: "li", text: unordered[1]!.trim(), ordered: false })
      continue
    }
    const ordered = line.match(/^\d+[.、]\s+(.*)$/)
    if (ordered) {
      flush()
      blocks.push({ kind: "li", text: ordered[1]!.trim(), ordered: true })
      continue
    }
    paragraph.push(line.trim())
  }
  flush()
  return blocks
}

/** 拆分行内 **加粗** 为 run 描述（pure）。 */
export function parseRuns(text: string): Array<{ text: string; bold: boolean }> {
  const runs: Array<{ text: string; bold: boolean }> = []
  for (const part of text.split(/\*\*/)) {
    if (part) runs.push({ text: part, bold: runs.length % 2 === 1 })
  }
  return runs
}

function toParagraph(block: Block, spec: Spec): Paragraph {
  const baseFont = { ascii: "Times New Roman", eastAsia: spec.bodyFont }
  if (block.kind === "h1" || block.kind === "h2" || block.kind === "h3") {
    const headingFont = block.kind === "h1" ? spec.h1Font : block.kind === "h2" ? spec.h2Font : spec.bodyFont
    return new Paragraph({
      spacing: { line: spec.lineTwips, lineRule: spec.lineRule },
      children: [new TextRun({ text: block.text, bold: block.kind !== "h3", size: spec.bodySize, font: { ascii: "Times New Roman", eastAsia: headingFont } })],
    })
  }
  if (block.kind === "li") {
    const prefix = block.ordered ? "" : "• "
    return new Paragraph({
      spacing: { line: spec.lineTwips, lineRule: spec.lineRule },
      indent: { left: 640 },
      children: [
        new TextRun({ text: prefix, size: spec.bodySize, font: baseFont }),
        ...parseRuns(block.text).map((run) => new TextRun({ text: run.text, bold: run.bold, size: spec.bodySize, font: baseFont })),
      ],
    })
  }
  return new Paragraph({
    spacing: { line: spec.lineTwips, lineRule: spec.lineRule },
    indent: spec.firstLineIndent ? { firstLine: spec.firstLineIndent } : undefined,
    children: parseRuns(block.text).map((run) => new TextRun({ text: run.text, bold: run.bold, size: spec.bodySize, font: baseFont })),
  })
}

// ---- 打印友好 HTML ----

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function inlineHtml(text: string): string {
  return escapeHtml(text).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
}

export function toHtml(title: string, blocks: Block[], spec: Spec, aiLabel: boolean): string {
  const body = blocks
    .map((block) => {
      if (block.kind === "h1") return `<h1>${inlineHtml(block.text)}</h1>`
      if (block.kind === "h2") return `<h2>${inlineHtml(block.text)}</h2>`
      if (block.kind === "h3") return `<h3>${inlineHtml(block.text)}</h3>`
      if (block.kind === "li") {
        const prefix = block.ordered ? "" : "• "
        return `<p class="li">${prefix}${inlineHtml(block.text)}</p>`
      }
      return `<p>${inlineHtml(block.text)}</p>`
    })
    .join("\n")
  const bodyPt = spec.bodySize / 2
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  @page { size: A4; margin: ${(spec.pageMargin.top / 56.7).toFixed(0)}mm ${(spec.pageMargin.right / 56.7).toFixed(0)}mm ${(spec.pageMargin.bottom / 56.7).toFixed(0)}mm ${(spec.pageMargin.left / 56.7).toFixed(0)}mm; }
  body { font-family: "${spec.bodyFont}", "STFangsong", "SimSun", serif; font-size: ${bodyPt}pt; line-height: ${(spec.lineTwips / 40).toFixed(0)}px; }
  h1.doc-title { font-family: "${spec.titleFont}", "SimSun", serif; font-size: ${spec.titleSize / 2}pt; text-align: center; font-weight: bold; }
  h1, h2, h3 { font-family: "${spec.h1Font}", "SimHei", serif; font-size: ${bodyPt}pt; font-weight: bold; margin: 0.5em 0 0.2em; }
  h2, h3 { font-family: "${spec.h2Font}", "KaiTi", serif; font-weight: normal; }
  p { margin: 0; text-indent: ${spec.firstLineIndent ? "2em" : "0"}; }
  p.li { text-indent: 0; padding-left: 2em; text-indent: -2em; margin-left: 2em; }
  .ai-label { margin-top: 2em; text-align: right; color: #808080; font-size: 9pt; }
</style>
</head>
<body>
<h1 class="doc-title">${escapeHtml(title)}</h1>
${body}
${aiLabel ? `<p class="ai-label">${AI_LABEL}</p>` : ""}
</body>
</html>`
}

export const DocumentRenderTool = Tool.define(
  "document_render",
  Effect.gen(function* () {
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const instance = yield* InstanceState.context
          const format = ((params.format ?? "litigation") as FormatName) in SPECS ? ((params.format ?? "litigation") as FormatName) : "litigation"
          const spec = SPECS[format]!
          const aiLabel = params.aiLabel !== false
          const base = path.basename(params.filename).replace(/\.docx$/i, "")
          if (!base) throw new Error("filename 不能为空")

          const blocks = parseBlocks(params.content)
          const doc = new Document({
            sections: [
              {
                properties: { page: { margin: spec.pageMargin } },
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 400 },
                    children: [new TextRun({ text: params.title, bold: true, size: spec.titleSize, font: { ascii: "Times New Roman", eastAsia: spec.titleFont } })],
                  }),
                  ...blocks.map((block) => toParagraph(block, spec)),
                  ...(aiLabel
                    ? [
                        new Paragraph({
                          alignment: AlignmentType.RIGHT,
                          spacing: { before: 400 },
                          children: [new TextRun({ text: AI_LABEL, size: 18, color: "808080", font: { ascii: "Times New Roman", eastAsia: "宋体" } })],
                        }),
                      ]
                    : []),
                ],
              },
            ],
          })

          const docxName = `${base}.docx`
          const htmlName = `${base}.html`
          const docxPath = path.join(instance.directory, docxName)
          const htmlPath = path.join(instance.directory, htmlName)
          const buffer = yield* Effect.tryPromise({
            try: () => Packer.toBuffer(doc),
            catch: (error) => error,
          })
          yield* Effect.tryPromise({ try: () => Bun.write(docxPath, buffer), catch: (error) => error })
          yield* Effect.tryPromise({
            try: () => Bun.write(htmlPath, toHtml(params.title, blocks, spec, aiLabel)),
            catch: (error) => error,
          })

          return {
            output: [
              `已渲染文书：`,
              `- Word：${docxPath}`,
              `- 打印版 HTML：${htmlPath}（浏览器打开 → 打印 → 另存为 PDF）`,
              `版式：${format}；标题「${params.title}」；共 ${blocks.length} 个内容块；AI 生成标识：${aiLabel ? "已追加" : "未追加"}。`,
            ].join("\n"),
            title: `文书渲染：${base}`,
            metadata: { file: docxPath, htmlFile: htmlPath, format, blocks: blocks.length, aiLabel },
          }
        }).pipe(Effect.orDie),
    }
  }),
)
