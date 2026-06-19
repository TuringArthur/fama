import { Effect, Option, Schema } from "effect"
import { HttpClient, HttpClientRequest } from "effect/unstable/http"
import * as Tool from "./tool"
import DESCRIPTION from "./law_search.txt"
import { isRecord } from "@/util/record"

// 国家法律法规数据库（flk.npc.gov.cn）检索工具。
// 上游 API 受 SPA/风控保护，部分网络出口会返回 405 或 HTML 而非 JSON；本工具对失败做优雅降级，
// 返回规范化的检索建议与权威来源链接，而不是抛错中断。

const SEARCH_URL = "https://flk.npc.gov.cn/api/"
const SEARCH_REFERER = "https://flk.npc.gov.cn/"

export const Parameters = Schema.Struct({
  query: Schema.String.annotate({
    description: "法律名称或关键词，如「民法典」「刑法」「劳动合同法」或具体条文如「民法典 第一千零三条」",
  }),
  page: Schema.optional(Schema.Number).annotate({
    description: "页码，从 1 开始（默认 1）",
  }),
  size: Schema.optional(Schema.Number).annotate({
    description: "每页返回条目数（默认 10，最大 20）",
  }),
})

export type LawRecord = {
  title: string
  status: string
  publish: string
  expire: string
  office: string
  detailUrl: string
}

function str(value: unknown): string {
  return typeof value === "string" ? value : ""
}

// 把单个原始记录规范化为面向用户的结果（pure，便于单测）。
export function normalizeRecord(raw: unknown): LawRecord | undefined {
  if (!isRecord(raw)) return undefined
  const title = str(raw.title)
  if (!title) return undefined
  const id = str(raw.id)
  return {
    title,
    status: str(raw.status),
    publish: str(raw.publish),
    expire: str(raw.expire),
    office: str(raw.office),
    detailUrl: id ? `https://flk.npc.gov.cn/api/detail?id=${id}` : SEARCH_REFERER,
  }
}

// 解析搜索响应 JSON（pure，便于单测）。
export function parseSearchResults(body: unknown): LawRecord[] {
  if (!isRecord(body)) return []
  const result = isRecord(body.result) ? body.result : undefined
  const data = Array.isArray(result?.data) ? result!.data : []
  return data.map(normalizeRecord).filter((item): item is LawRecord => item !== undefined)
}

// 构造请求体（pure，便于单测）。
export function buildSearchBody(params: { query: string; page?: number; size?: number }): Record<string, string> {
  return {
    title: params.query,
    nav_type: "title",
    nav: "1",
    page: String(params.page ?? 1),
    size: String(Math.min(params.size ?? 10, 20)),
  }
}

function formatRecord(record: LawRecord): string {
  const parts = [`《${record.title}》`]
  if (record.status) parts.push(`状态：${record.status}`)
  if (record.publish) parts.push(`公布：${record.publish}`)
  if (record.expire) parts.push(`时效：${record.expire}`)
  if (record.office) parts.push(`制定机关：${record.office}`)
  parts.push(`来源：${record.detailUrl}`)
  return parts.join("｜")
}

function fallbackGuidance(query: string, page: number): string {
  return [
    `未从国家法律法规数据库（flk.npc.gov.cn）获取到「${query}」的结构化结果（上游可能返回了非 JSON 响应或暂时不可达）。`,
    `建议：`,
    `1. 直接访问检索页：https://flk.npc.gov.cn/ 搜索「${query}」并核对现行有效版本；`,
    `2. 或用 webfetch 抓取具体法条页面的全文后逐条分析。`,
    `引用法律时务必注明全称与条文号，并确认所引为现行有效版本。`,
  ].join("\n")
}

export const LawSearchTool = Tool.define(
  "law_search",
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient
    const httpOk = HttpClient.filterStatusOk(http)

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const page = params.page ?? 1
          const query = params.query.trim()
          if (!query) throw new Error("query 不能为空")

          yield* ctx.ask({
            permission: "law_search",
            patterns: [query],
            always: ["*"],
            metadata: { query, page },
          })
          yield* ctx.metadata({ title: `法条检索 "${query}"（第${page}页）` })

          const request = HttpClientRequest.post(SEARCH_URL).pipe(
            HttpClientRequest.bodyUrlParams(buildSearchBody({ query, page, size: params.size })),
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

          // 上游受 SPA/风控保护：网络出口受限时可能返回 405 或 HTML 而非 JSON。
          // 用 Effect.option 把任何请求失败都变成 Option.None，再走降级路径。
          const responseOpt = yield* httpOk.execute(request).pipe(Effect.timeout("25 seconds"), Effect.option)

          if (Option.isNone(responseOpt)) {
            return {
              output: fallbackGuidance(query, page),
              title: `法条检索：${query}`,
              metadata: { query, page, count: 0, degraded: true },
            }
          }

          const response = responseOpt.value
          const text = yield* response.text.pipe(Effect.option, Effect.map((v) => Option.getOrElse(v, () => "")))
          const contentType = (response.headers["content-type"] ?? "").toLowerCase()
          if (contentType.includes("html") || /^\s*<!doctype|^\s*<html/i.test(text)) {
            return {
              output: fallbackGuidance(query, page),
              title: `法条检索：${query}`,
              metadata: { query, page, count: 0, degraded: true },
            }
          }

          let json: unknown
          try {
            json = JSON.parse(text)
          } catch {
            return {
              output: fallbackGuidance(query, page),
              title: `法条检索：${query}`,
              metadata: { query, page, count: 0, degraded: true },
            }
          }

          const records = parseSearchResults(json)
          if (records.length === 0) {
            return {
              output: `未在数据库中找到匹配「${query}」的法律法规。请核对名称后重试，或访问 https://flk.npc.gov.cn/ 手动检索。`,
              title: `法条检索：${query}`,
              metadata: { query, page, count: 0, degraded: false },
            }
          }

          const output = [
            `在国家法律法规数据库中检索「${query}」，共找到 ${records.length} 条（第${page}页）：`,
            ...records.map((record, i) => `${i + 1}. ${formatRecord(record)}`),
            ``,
            `提示：请以「公布/时效」字段确认现行有效版本；如需具体条文全文，可用 webfetch 抓取对应来源链接。`,
          ].join("\n")

          return { output, title: `法条检索：${query}`, metadata: { query, page, count: records.length, degraded: false } }
        }).pipe(Effect.orDie),
    }
  }),
)
