import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import DESCRIPTION from "./law_get.txt"
import { getArticle, isIndexAvailable, searchLawTitles } from "./law-index"

// 本地法条库的精确条文调取：输入法名 + 条号，返回条文全文（离线、无风控）。

export const Parameters = Schema.Struct({
  law: Schema.String.annotate({
    description: "法规名称，如「民法典」「劳动合同法」，可省略「中华人民共和国」前缀",
  }),
  article: Schema.String.annotate({
    description: "条号，如「577」「第五百七十七条」「577之一」",
  }),
})

export const LawGetTool = Tool.define(
  "law_get",
  Effect.gen(function* () {
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const law = params.law.trim()
          const article = params.article.trim()
          yield* ctx.metadata({ title: `法条查询《${law}》${article}` })

          if (!isIndexAvailable()) {
            return {
              output: [
                "本地法条库索引未安装（data/fama-laws.db）。",
                "可运行 `bun script/build-law-index.ts` 构建，或改用 law_search（在线检索国家法律法规数据库）。",
              ].join("\n"),
              title: `法条查询：${law}`,
              metadata: { law, article, found: false, local: false },
            }
          }

          const hit = getArticle(law, article)
          if (!hit) {
            const similar = searchLawTitles(law, 5)
            const lines = [
              `本地法条库中未找到《${law}》${article}。`,
              similar.length > 0 ? `名称相近的法规：${similar.map((s) => `《${s.title}》`).join("、")}` : "名称相近的法规：无（可尝试 law_search 在线检索）。",
              `提示：确认条号写法（如「第五百七十七条之一」）或该法是否在库中。`,
            ]
            return {
              output: lines.join("\n"),
              title: `法条查询：${law}`,
              metadata: { law, article, found: false, local: true },
            }
          }

          const output = [
            `《${hit.lawTitle}》${hit.num}${hit.chapter ? `（${hit.chapter}）` : ""}`,
            hit.content,
            "",
            `来源：本地法条库（离线快照）。法条可能已修订，出具正式意见前请核对现行有效版本。`,
          ].join("\n")

          return {
            output,
            title: `法条查询：《${hit.lawTitle}》${hit.num}`,
            metadata: { law, article, found: true, local: true },
          }
        }).pipe(Effect.orDie),
    }
  }),
)
