import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import DESCRIPTION from "./citation_check.txt"
import { isIndexAvailable, verifyCitations } from "./law-index"

// 引用真实性核验：抽取文本中的《法名》第X条引用，与本地法条库逐条比对，
// 标记 verified / law-only / unknown，拦截「编造法条」与「条号笔误」。

export const Parameters = Schema.Struct({
  text: Schema.String.annotate({
    description: "待核验的法律文书草稿或回答文本",
  }),
})

function formatStatus(status: { law: string; article: string; state: string; found: string }): string {
  if (status.state === "verified") {
    return `✓ 《${status.law}》${status.article} — 已命中本地库（${status.found}）`
  }
  if (status.state === "law-only") {
    return `⚠ 《${status.law}》${status.article} — 法规在库，但该条号未命中（核对条号写法或版本）`
  }
  return `✗ 《${status.law}》${status.article} — 法规未在本地库命中，疑似编造引用，必须重新检索确认`
}

export const CitationCheckTool = Tool.define(
  "citation_check",
  Effect.gen(function* () {
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const text = params.text.trim()
          yield* ctx.metadata({ title: "引用核验" })

          if (!isIndexAvailable()) {
            return {
              output: "本地法条库索引未安装（data/fama-laws.db），无法离线核验。可运行 `bun script/build-law-index.ts` 构建。",
              title: "引用核验：索引缺失",
              metadata: { count: 0, verified: 0, lawOnly: 0, unknown: 0, available: false },
            }
          }

          if (!text) {
            return {
              output: "待核验文本为空。",
              title: "引用核验",
              metadata: { count: 0, verified: 0, lawOnly: 0, unknown: 0, available: true },
            }
          }

          const statuses = verifyCitations(text)
          if (statuses.length === 0) {
            return {
              output: "未在文本中识别到《法名》+ 条号形式的法条引用，无需核验。",
              title: "引用核验",
              metadata: { count: 0, verified: 0, lawOnly: 0, unknown: 0, available: true },
            }
          }

          const verified = statuses.filter((s) => s.state === "verified").length
          const lawOnly = statuses.filter((s) => s.state === "law-only").length
          const unknown = statuses.filter((s) => s.state === "unknown").length

          const output = [
            `共识别 ${statuses.length} 处法条引用：${verified} 条已核实，${lawOnly} 条待核对条号，${unknown} 条未命中。`,
            "",
            ...statuses.map(formatStatus),
            "",
            unknown > 0
              ? "⚠ 存在未命中引用：对外文书定稿前必须逐条改用 law_search / law_get（或法宝数据源）确认，不得保留未经核实的引用。"
              : "提示：verified 仅代表条文存在于本地库，时效性请以官方公布为准。",
          ].join("\n")

          return {
            output,
            title: `引用核验：${statuses.length} 处（${verified}✓ ${lawOnly}⚠ ${unknown}✗）`,
            metadata: { count: statuses.length, verified, lawOnly, unknown, available: true },
          }
        }).pipe(Effect.orDie),
    }
  }),
)
