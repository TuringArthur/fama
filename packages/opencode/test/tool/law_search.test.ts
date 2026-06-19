import { describe, expect, test } from "bun:test"
import { buildSearchBody, normalizeRecord, parseSearchResults } from "../../src/tool/law_search"

describe("law_search parsing", () => {
  test("buildSearchBody emits the flk search form fields with defaults", () => {
    const body = buildSearchBody({ query: "民法典" })
    expect(body.title).toBe("民法典")
    expect(body.nav_type).toBe("title")
    expect(body.page).toBe("1")
    expect(body.size).toBe("10")
  })

  test("buildSearchBody clamps size to 20 and honors page", () => {
    const body = buildSearchBody({ query: "刑法", page: 3, size: 99 })
    expect(body.page).toBe("3")
    expect(body.size).toBe("20")
  })

  test("normalizeRecord maps known fields and builds a detail URL from the id", () => {
    const record = normalizeRecord({
      id: "abc123",
      title: "中华人民共和国民法典",
      status: "现行有效",
      publish: "2020-05-28",
      expire: "",
      office: "全国人民代表大会",
    })
    expect(record).toBeDefined()
    expect(record?.title).toBe("中华人民共和国民法典")
    expect(record?.status).toBe("现行有效")
    expect(record?.publish).toBe("2020-05-28")
    expect(record?.office).toBe("全国人民代表大会")
    expect(record?.detailUrl).toBe("https://flk.npc.gov.cn/api/detail?id=abc123")
  })

  test("normalizeRecord drops records without a title and fills absent fields", () => {
    expect(normalizeRecord({ id: "x", status: "现行有效" })).toBeUndefined()
    expect(normalizeRecord("not an object")).toBeUndefined()
    const bare = normalizeRecord({ title: "劳动合同法" })
    expect(bare?.title).toBe("劳动合同法")
    expect(bare?.status).toBe("")
    expect(bare?.detailUrl).toBe("https://flk.npc.gov.cn/")
  })

  test("parseSearchResults extracts records from the flk result envelope", () => {
    const body = {
      result: {
        total: 2,
        data: [
          { id: "1", title: "民法典", status: "现行有效" },
          { id: "2", title: "刑法", status: "现行有效" },
          { id: "3", title: "", status: "现行有效" },
        ],
      },
    }
    const records = parseSearchResults(body)
    expect(records).toHaveLength(2)
    expect(records.map((r) => r.title)).toEqual(["民法典", "刑法"])
  })

  test("parseSearchResults tolerates malformed envelopes", () => {
    expect(parseSearchResults({ result: { data: "oops" } })).toEqual([])
    expect(parseSearchResults({ result: null })).toEqual([])
    expect(parseSearchResults("nope")).toEqual([])
    expect(parseSearchResults({})).toEqual([])
  })
})
