import { Effect, Option, Schema } from "effect"
import { HttpClient, HttpClientRequest } from "effect/unstable/http"
import * as Tool from "./tool"
import DESCRIPTION from "./case_search.txt"
import { isRecord } from "@/util/record"

// 裁判文书检索工具。
// 中国裁判文书网（wenshu.court.gov.cn）无开放 JSON API、受强风控保护；最高法典型案例同样无稳定结构化接口。
// 因此本工具的"可验证核心"是纯函数：把案由/案号/关键词/法院/年份等结构化查询组装为权威检索入口与规范字段，
// 网络执行则尽力而为、不可达时优雅降级为「权威深链 + 检索指引」，绝不崩溃。

const WENSHU_ENTRY = "https://wenshu.court.gov.cn/"
const WENSHU_SEARCH_URL = "https://wenshu.court.gov.cn/website/wenshu/181217BMTKHNT2W0/index.html"
const COURT_GOV_CASE_URL = "https://www.court.gov.cn/"
const SEARCH_REFERER = WENSHU_ENTRY

export const Parameters = Schema.Struct({
  query: Schema.String.annotate({
    description: "裁判文书检索关键词，如「买卖合同纠纷」「违约金过高」「表见代理」",
  }),
  cause: Schema.optional(Schema.String).annotate({
    description: "案由，如「买卖合同纠纷」「寻衅滋事」「政府信息公开」",
  }),
  caseNo: Schema.optional(Schema.String).annotate({
    description: "案号，如「(2023)京01民终123号」。提供案号时以案号精确匹配为主",
  }),
  court: Schema.optional(Schema.String).annotate({
    description: "裁判法院，如「北京市第一中级人民法院」「最高人民法院」",
  }),
  year: Schema.optional(Schema.Number).annotate({
    description: "裁判年份，如 2023",
  }),
  limit: Schema.optional(Schema.Number).annotate({
    description: "最多返回条目数（默认 10，最大 20）",
  }),
})

export type CaseParams = {
  query: string
  cause?: string
  caseNo?: string
  court?: string
  year?: number
  limit?: number
}

export type CaseRecord = {
  title: string
  caseNo: string
  court: string
  cause: string
  judgmentDate: string
  summary: string
  url: string
}

// 把结构化查询组装为裁判文书网检索的表单参数（pure，便于单测）。
export function buildSearchParams(params: CaseParams): Record<string, string> {
  const form: Record<string, string> = {}
  if (params.caseNo) form.caseNo = params.caseNo
  if (params.cause) form.cause = params.cause
  if (params.court) form.court = params.court
  if (params.year) form.judgmentYear = String(params.year)
  // 关键词始终作为兜底检索项
  form.searchKey = params.query.trim()
  return form
}

// 裁判文书网搜索页深链（把关键词作为查询串拼在 URL，便于用户/Agent 一键打开）。
export function canonicalWenshuUrl(params: CaseParams): string {
  const u = new URL(WENSHU_SEARCH_URL)
  const q = params.caseNo ?? params.cause ?? params.query.trim()
  if (q) u.searchParams.set("searchCondition", q)
  return u.toString()
}

// 最高法官网检索深链（关键词检索）。
export function canonicalCourtGovUrl(params: CaseParams): string {
  const u = new URL(COURT_GOV_CASE_URL)
  const q = params.caseNo ?? params.cause ?? params.query.trim()
  if (q) u.searchParams.set("keyword", q)
  return u.toString()
}

// 规范化单条裁判记录（pure，便于单测）。
export function normalizeCaseRecord(raw: unknown): CaseRecord | undefined {
  if (!isRecord(raw)) return undefined
  const title = str(raw.title) || str(raw.caseName) || str(raw.name)
  const caseNo = str(raw.caseNo) || str(raw.case_no) || str(raw.ah)
  // 没有标题也没有案号的记录无法识别
  if (!title && !caseNo) return undefined
  return {
    title: title || caseNo,
    caseNo,
    court: str(raw.court) || str(raw.courtName),
    cause: str(raw.cause) || str(raw.caseCause),
    judgmentDate: str(raw.judgmentDate) || str(raw.judgementDate) || str(raw.date),
    summary: str(raw.summary) || str(raw.abstract) || str(raw.judicialSummary),
    url: str(raw.url) || str(raw.docId) ? withUrl(raw.url, raw.docId) : WENSHU_ENTRY,
  }
}

function withUrl(url: unknown, docId: unknown): string {
  if (typeof url === "string" && url) return url
  if (typeof docId === "string" && docId) return `https://wenshu.court.gov.cn/website/wenshu/181217BMTKHNT2W0/index.html?docId=${encodeURIComponent(docId)}`
  return WENSHU_ENTRY
}

function str(value: unknown): string {
  return typeof value === "string" ? value : ""
}

// 解析搜索响应 JSON 为裁判记录列表（pure，容忍多种信封结构）。
export function parseCaseResults(body: unknown): CaseRecord[] {
  if (!isRecord(body)) return []
  const data = (() => {
    if (Array.isArray(body.data)) return body.data
    if (isRecord(body.result) && Array.isArray(body.result.data)) return body.result.data
    if (isRecord(body.list) && Array.isArray(body.list.records)) return body.list.records
    return []
  })()
  return data.map(normalizeCaseRecord).filter((item): item is CaseRecord => item !== undefined)
}

export function formatCaseRecord(record: CaseRecord): string {
  const parts = [`《${record.title}》`]
  if (record.caseNo) parts.push(`案号：${record.caseNo}`)
  if (record.court) parts.push(`法院：${record.court}`)
  if (record.cause) parts.push(`案由：${record.cause}`)
  if (record.judgmentDate) parts.push(`裁判日期：${record.judgmentDate}`)
  parts.push(`来源：${record.url}`)
  return parts.join("｜")
}

export function describeQuery(params: CaseParams): string {
  const segs = [params.query.trim() && `关键词「${params.query.trim()}」`]
  if (params.caseNo) segs.push(`案号「${params.caseNo}」`)
  if (params.cause) segs.push(`案由「${params.cause}」`)
  if (params.court) segs.push(`法院「${params.court}」`)
  if (params.year) segs.push(`${params.year}年`)
  return segs.filter(Boolean).join("、")
}

function degradedGuidance(params: CaseParams): string {
  return [
    `未从中国裁判文书网获取到${describeQuery(params)}的结构化裁判文书结果（该网无开放 JSON 接口、受强风控保护，部分网络出口返回非 JSON 或需登录）。`,
    `建议：`,
    `1. 裁判文书网检索：${canonicalWenshuUrl(params)}`,
    `2. 最高法官网检索：${canonicalCourtGovUrl(params)}`,
    `3. 或用 webfetch 抓取上述链接后逐份分析裁判要旨。`,
    `引用案例时务必核对案号、法院与裁判日期，并区分生效裁判与一审未生效裁判。`,
  ].join("\n")
}

export const CaseSearchTool = Tool.define(
  "case_search",
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient
    const httpOk = HttpClient.filterStatusOk(http)

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const query = params.query.trim()
          if (!query && !params.caseNo) throw new Error("query 或 caseNo 至少提供一个")

          yield* ctx.ask({
            permission: "case_search",
            patterns: [query, params.caseNo ?? ""].filter(Boolean),
            always: ["*"],
            metadata: { query, caseNo: params.caseNo },
          })
          yield* ctx.metadata({ title: `裁判文书检索 "${describeQuery(params)}"` })

          // 上游受风控保护：多数情况下无法直接拿到结构化 JSON；这里尽力请求，失败/HTML 一律降级。
          const request = HttpClientRequest.post(WENSHU_ENTRY).pipe(
            HttpClientRequest.bodyUrlParams(buildSearchParams(params)),
            HttpClientRequest.setHeaders({
              Accept: "application/json, text/plain, */*",
              "Accept-Language": "zh-CN,zh;q=0.9",
              "X-Requested-With": "XMLHttpRequest",
              Origin: SEARCH_REFERER,
              Referer: SEARCH_REFERER,
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
            }),
          )
          const responseOpt = yield* httpOk.execute(request).pipe(Effect.timeout("25 seconds"), Effect.option)

          const limit = Math.min(params.limit ?? 10, 20)
          if (Option.isNone(responseOpt)) {
            return {
              output: degradedGuidance(params),
              title: `裁判文书检索：${describeQuery(params)}`,
              metadata: { query, count: 0, degraded: true },
            }
          }

          const text = yield* responseOpt.value.text.pipe(Effect.option, Effect.map((v) => Option.getOrElse(v, () => "")))
          const contentType = (responseOpt.value.headers["content-type"] ?? "").toLowerCase()
          let json: unknown
          try {
            if (contentType.includes("html") || /^\s*<!doctype|^\s*<html/i.test(text)) throw new Error("html")
            json = JSON.parse(text)
          } catch {
            return {
              output: degradedGuidance(params),
              title: `裁判文书检索：${describeQuery(params)}`,
              metadata: { query, count: 0, degraded: true },
            }
          }

          const records = parseCaseResults(json).slice(0, limit)
          if (records.length === 0) {
            return {
              output: degradedGuidance(params),
              title: `裁判文书检索：${describeQuery(params)}`,
              metadata: { query, count: 0, degraded: false },
            }
          }

          const output = [
            `检索${describeQuery(params)}，共找到 ${records.length} 份裁判文书：`,
            ...records.map((record, i) => `${i + 1}. ${formatCaseRecord(record)}`),
            ``,
            `提示：核对案号、法院与裁判日期以确认生效状态；如需裁判要旨全文，可用 webfetch 抓取对应来源链接后逐份分析。`,
          ].join("\n")

          return {
            output,
            title: `裁判文书检索：${describeQuery(params)}`,
            metadata: { query, count: records.length, degraded: false },
          }
        }).pipe(Effect.orDie),
    }
  }),
)
