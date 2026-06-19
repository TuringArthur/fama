import { describe, expect, test } from "bun:test"
import {
  buildSearchParams,
  canonicalCourtGovUrl,
  canonicalWenshuUrl,
  describeQuery,
  formatCaseRecord,
  normalizeCaseRecord,
  parseCaseResults,
} from "../../src/tool/case_search"

describe("case_search parsing", () => {
  test("buildSearchParams prefers case number / cause / court and always echoes searchKey", () => {
    const form = buildSearchParams({
      query: "违约金过高",
      caseNo: "(2023)京01民终123号",
      cause: "买卖合同纠纷",
      court: "北京市第一中级人民法院",
      year: 2023,
    })
    expect(form.caseNo).toBe("(2023)京01民终123号")
    expect(form.cause).toBe("买卖合同纠纷")
    expect(form.court).toBe("北京市第一中级人民法院")
    expect(form.judgmentYear).toBe("2023")
    expect(form.searchKey).toBe("违约金过高")
  })

  test("buildSearchParams omits absent optional fields", () => {
    const form = buildSearchParams({ query: "表见代理" })
    expect(form.searchKey).toBe("表见代理")
    expect("caseNo" in form).toBe(false)
    expect("cause" in form).toBe(false)
  })

  test("canonicalWenshuUrl composes a search deep link from the best available term", () => {
    const byCaseNo = new URL(canonicalWenshuUrl({ query: "x", caseNo: "(2023)京01民终123号" }))
    expect(byCaseNo.hostname).toBe("wenshu.court.gov.cn")
    expect(byCaseNo.searchParams.get("searchCondition")).toBe("(2023)京01民终123号")

    const byCause = canonicalWenshuUrl({ query: "x", cause: "买卖合同纠纷" })
    expect(new URL(byCause).searchParams.get("searchCondition")).toBe("买卖合同纠纷")

    const byKeyword = canonicalWenshuUrl({ query: "违约金过高" })
    expect(new URL(byKeyword).searchParams.get("searchCondition")).toBe("违约金过高")
  })

  test("canonicalCourtGovUrl composes a keyword deep link", () => {
    const url = new URL(canonicalCourtGovUrl({ query: "寻衅滋事" }))
    expect(url.hostname).toBe("www.court.gov.cn")
    expect(url.searchParams.get("keyword")).toBe("寻衅滋事")
  })

  test("normalizeCaseRecord accepts common field aliases and builds a docId URL", () => {
    const record = normalizeCaseRecord({
      caseName: "张某与李某买卖合同纠纷",
      ah: "(2023)京01民终123号",
      courtName: "北京市第一中级人民法院",
      caseCause: "买卖合同纠纷",
      judgmentDate: "2023-06-15",
      docId: "abc",
    })
    expect(record?.title).toBe("张某与李某买卖合同纠纷")
    expect(record?.caseNo).toBe("(2023)京01民终123号")
    expect(record?.court).toBe("北京市第一中级人民法院")
    expect(record?.cause).toBe("买卖合同纠纷")
    expect(record?.judgmentDate).toBe("2023-06-15")
    expect(record?.url).toContain("docId=abc")
  })

  test("normalizeCaseRecord falls back to caseNo as title and drops records with neither", () => {
    expect(normalizeCaseRecord({ court: "最高法院" })).toBeUndefined()
    expect(normalizeCaseRecord("nope")).toBeUndefined()
    const noTitle = normalizeCaseRecord({ caseNo: "(2023)京01民终123号", court: "北京市第一中级人民法院" })
    expect(noTitle?.title).toBe("(2023)京01民终123号")
    expect(noTitle?.url).toBe("https://wenshu.court.gov.cn/")
  })

  test("parseCaseResults extracts records across different response envelopes", () => {
    const a = parseCaseResults({ data: [{ title: "案例一", caseNo: "(1)" }, { title: "案例二", caseNo: "(2)" }] })
    expect(a).toHaveLength(2)

    const b = parseCaseResults({ result: { data: [{ caseName: "案例三", ah: "(3)" }] } })
    expect(b.map((r) => r.caseNo)).toEqual(["(3)"])

    const c = parseCaseResults({ list: { records: [{ name: "案例四" }] } })
    expect(c.map((r) => r.title)).toEqual(["案例四"])
  })

  test("parseCaseResults tolerates malformed envelopes", () => {
    expect(parseCaseResults({ result: { data: "bad" } })).toEqual([])
    expect(parseCaseResults({ data: null })).toEqual([])
    expect(parseCaseResults("nope")).toEqual([])
    expect(parseCaseResults({})).toEqual([])
  })

  test("formatCaseRecord renders the structured fields", () => {
    const text = formatCaseRecord({
      title: "案例",
      caseNo: "(2023)京01民终123号",
      court: "北京市第一中级人民法院",
      cause: "买卖合同纠纷",
      judgmentDate: "2023-06-15",
      summary: "",
      url: "https://example.com/x",
    })
    expect(text).toContain("《案例》")
    expect(text).toContain("案号：(2023)京01民终123号")
    expect(text).toContain("法院：北京市第一中级人民法院")
    expect(text).toContain("案由：买卖合同纠纷")
    expect(text).toContain("裁判日期：2023-06-15")
    expect(text).toContain("来源：https://example.com/x")
  })

  test("describeQuery joins structured terms", () => {
    const text = describeQuery({ query: "违约金", cause: "买卖合同纠纷", year: 2023 })
    expect(text).toContain("关键词「违约金」")
    expect(text).toContain("案由「买卖合同纠纷」")
    expect(text).toContain("2023年")
  })
})
