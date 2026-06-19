import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import DESCRIPTION from "./contract_extract.txt"
import { FSUtil } from "@fama-ai/core/fs-util"

// 合同条款抽取工具。
// 处理用户提供的本地合同文本（行内 text 或 filePath），不依赖外部网络，核心逻辑全部为纯函数、可单测。
// 按合同类型与条款类别抽取主体（甲方/乙方/...）、标的、违约责任、争议解决、管辖等结构化条款，便于审查与风险定位。

export type ClauseCategory =
  | "parties"
  | "subjectMatter"
  | "price"
  | "performance"
  | "breach"
  | "disputeResolution"
  | "jurisdiction"
  | "term"
  | "confidentiality"
  | "forceMajeure"
  | "intellectualProperty"
  | "other"

export const CATEGORY_LABELS: Record<ClauseCategory, string> = {
  parties: "主体",
  subjectMatter: "标的",
  price: "价款/报酬",
  performance: "履行",
  breach: "违约责任",
  disputeResolution: "争议解决",
  jurisdiction: "管辖",
  term: "期限",
  confidentiality: "保密",
  forceMajeure: "不可抗力",
  intellectualProperty: "知识产权",
  other: "其他",
}

// 按条款关键词识别类别。优先级靠前的优先（同一节同时命中多个时取靠前者）。
const CATEGORY_KEYWORDS: Array<{ category: ClauseCategory; keywords: string[] }> = [
  { category: "jurisdiction", keywords: ["管辖", "管辖法院", "合同履行地", "被告住所地", "签订地", "履行地法院"] },
  { category: "disputeResolution", keywords: ["争议解决", "协商解决", "协商不成", "调解", "仲裁", "仲裁委员会", "向法院起", "人民法院", "提起诉讼"] },
  { category: "forceMajeure", keywords: ["不可抗力", "不能预见", "不能避免", "不能克服"] },
  { category: "breach", keywords: ["违约责任", "违约金", "承担违约", "赔偿损失", "继续履行", "采取补救", "解除合同"] },
  { category: "confidentiality", keywords: ["保密", "商业秘密", "保密义务", "不得泄露", "保密期限"] },
  { category: "term", keywords: ["合同期限", "本合同期限", "有效期", "合同有效", "届满", "终止", "续签", "续约"] },
  { category: "price", keywords: ["价款", "报酬", "总金额", "总价", "单价", "结算", "付款方式", "支付方式", "币种", "人民币"] },
  { category: "performance", keywords: ["履行期限", "履行方式", "交付", "验收", "交货", "运输", "质量标准", "标准"] },
  { category: "intellectualProperty", keywords: ["知识产权", "专利", "商标", "著作权", "版权", "专有技术", "技术成果"] },
]

export type Section = { heading: string; text: string }

export type ExtractedClause = {
  category: ClauseCategory
  label: string
  heading: string
  text: string
}

export type Party = { role: string; name: string }

export type ContractExtraction = {
  parties: Party[]
  clauses: ExtractedClause[]
  sectionCount: number
}

// Chinese numeral + arabic numeral matcher for 第X条 / 第X章 markers.
const SECTION_HEADING_RE = /第[一二三四五六七八九十百千零0-9]+[条章节款]/g

// 把合同文本按「第X条」/「第X章」等切分为条款节。未命中条款标记时按换行段降级切分（pure，可单测）。
export function splitSections(text: string): Section[] {
  const normalized = text.replace(/\r\n/g, "\n")
  const markers = [...normalized.matchAll(SECTION_HEADING_RE)]
  if (markers.length === 0) {
    // 降级：按空行切段
    return normalized
      .split(/\n\s*\n/)
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunk, i) => ({ heading: `段${i + 1}`, text: chunk }))
  }

  const sections: Section[] = []
  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].index!
    const heading = markers[i][0]
    const end = i + 1 < markers.length ? markers[i + 1].index! : normalized.length
    const body = normalized.slice(start + heading.length, end).trim()
    sections.push({ heading, text: body ? `${heading} ${body}` : heading })
  }
  // 条款标记之前的前言（若有）单列一节
  if (markers[0].index! > 0) {
    const preface = normalized.slice(0, markers[0].index!).trim()
    if (preface) sections.unshift({ heading: "前言", text: preface })
  }
  return sections
}

// 按关键词给条款节归类（pure，可单测）。优先级见 CATEGORY_KEYWORDS。
export function classifySection(section: Section): ClauseCategory {
  const haystack = section.text
  for (const { category, keywords } of CATEGORY_KEYWORDS) {
    if (keywords.some((kw) => haystack.includes(kw))) return category
  }
  return "other"
}

// 抽取合同主体（甲方/乙方/出租方/买方/...）。启发式正则，便于快速定位而非穷尽（pure，可单测）。
const PARTY_ROLES = [
  "甲方",
  "乙方",
  "丙方",
  "丁方",
  "出租人",
  "承租人",
  "出租方",
  "承租方",
  "买方",
  "卖方",
  "供方",
  "需方",
  "委托方",
  "受托方",
  "发包方",
  "承包方",
  "发包人",
  "承包人",
  "债权人",
  "债务人",
  "保证人",
  "抵押人",
  "抵押权人",
  "定作方",
  "承揽方",
  "许可方",
  "被许可方",
]
const PARTY_RE = new RegExp(
  `(${PARTY_ROLES.join("|")})(?:[（(][^）)]*[）)])?[：:]\\s*([^，,。;；\\n)）)(]{2,40})`,
  "g",
)

export function extractParties(text: string): Party[] {
  const parties: Party[] = []
  const seen = new Set<string>()
  for (const match of text.replace(/\r\n/g, "\n").matchAll(PARTY_RE)) {
    const role = match[1]
    const name = match[2].trim()
    if (!name || seen.has(`${role}|${name}`)) continue
    seen.add(`${role}|${name}`)
    parties.push({ role, name })
  }
  return parties
}

// 主抽取函数：切节→归类→过滤→合并主体（pure，可单测）。
export function extract(text: string, categories?: ClauseCategory[]): ContractExtraction {
  const sections = splitSections(text)
  const wanted = categories?.length ? new Set(categories) : undefined

  const clauses: ExtractedClause[] = []
  for (const section of sections) {
    const category = classifySection(section)
    if (wanted && !wanted.has(category)) continue
    clauses.push({ category, label: CATEGORY_LABELS[category], heading: section.heading, text: section.text })
  }

  return {
    parties: extractParties(text),
    clauses,
    sectionCount: sections.length,
  }
}

export function formatResult(extraction: ContractExtraction): string {
  const lines: string[] = []
  lines.push(`已抽取合同条款：共 ${extraction.sectionCount} 节，命中 ${extraction.clauses.length} 条分类条款。`)

  if (extraction.parties.length) {
    lines.push("", "【合同主体】")
    for (const party of extraction.parties) lines.push(`- ${party.role}：${party.name}`)
  }

  const groups = groupBy(extraction.clauses, (c) => c.category)
  const order: ClauseCategory[] = [
    "parties",
    "subjectMatter",
    "price",
    "performance",
    "term",
    "breach",
    "disputeResolution",
    "jurisdiction",
    "confidentiality",
    "forceMajeure",
    "intellectualProperty",
    "other",
  ]
  for (const category of order) {
    const items = groups.get(category)
    if (!items?.length) continue
    lines.push("", `【${CATEGORY_LABELS[category]}】（${items.length}）`)
    for (const item of items) lines.push(`- ${truncate(item.text, 200)}`)
  }

  lines.push("", "提示：本工具为启发式条款定位，便于审查与风险排查；正式审查仍须通读全文并核对条款效力。")
  return lines.join("\n")
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\n+/g, " ").trim()
  return clean.length > max ? `${clean.slice(0, max)}…` : clean
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>()
  for (const item of items) {
    const k = key(item)
    const arr = map.get(k) ?? []
    arr.push(item)
    map.set(k, arr)
  }
  return map
}

export const Parameters = Schema.Struct({
  text: Schema.optional(Schema.String).annotate({
    description: "待抽取的合同文本（与 filePath 二选一）",
  }),
  filePath: Schema.optional(Schema.String).annotate({
    description: "合同文件的绝对路径（.txt/.md/.docx 文本），与 text 二选一",
  }),
  clauses: Schema.optional(Schema.Array(Schema.String)).annotate({
    description: `仅抽取指定类别，如 ["breach","jurisdiction","disputeResolution"]。可选值：${Object.entries(CATEGORY_LABELS)
      .map(([k, v]) => `${k}(${v})`)
      .join(", ")}`,
  }),
})

function parseCategories(input: readonly string[] | undefined): ClauseCategory[] | undefined {
  if (!input?.length) return undefined
  const valid = new Set<string>(Object.keys(CATEGORY_LABELS))
  return input.filter((c): c is ClauseCategory => valid.has(c))
}

export const ContractExtractTool = Tool.define(
  "contract_extract",
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          if (!params.text && !params.filePath) {
            throw new Error("text 与 filePath 至少提供一个")
          }

          const target = params.filePath ?? params.text!
          yield* ctx.ask({
            permission: params.filePath ? "read" : "contract_extract",
            patterns: params.filePath ? [params.filePath] : [],
            always: ["*"],
            metadata: { source: params.filePath ? "file" : "inline", categories: params.clauses },
          })

          const loaded = params.text ?? (yield* fs.readFileStringSafe(params.filePath!).pipe(Effect.orDie))
          const text = loaded ?? ""
          if (!text.trim()) {
            return {
              output: "提供的合同文本为空，无法抽取条款。",
              title: "合同条款抽取",
              metadata: { source: params.filePath ? "file" : "inline", sectionCount: 0, clauseCount: 0 },
            }
          }

          const categories = parseCategories(params.clauses)
          const extraction = extract(text, categories)
          yield* ctx.metadata({ title: `合同条款抽取（${extraction.clauses.length} 条）` })

          return {
            output: formatResult(extraction),
            title: "合同条款抽取",
            metadata: {
              source: params.filePath ? "file" : "inline",
              sectionCount: extraction.sectionCount,
              clauseCount: extraction.clauses.length,
            },
          }
        }).pipe(Effect.orDie),
    }
  }),
)
