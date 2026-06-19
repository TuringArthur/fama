import { describe, expect, test } from "bun:test"
import {
  classifySection,
  extract,
  extractParties,
  formatResult,
  splitSections,
} from "../../src/tool/contract_extract"

const CONTRACT = `
房屋租赁合同

甲方（出租人）：张三
乙方（承租人）：李四

第一条 房屋基本情况
甲方将位于北京市朝阳区某小区1号的房屋出租给乙方，建筑面积100平方米。

第二条 租赁期限
本合同期限为自2023年1月1日起至2024年12月31日止，届满可协商续签。

第三条 租金及支付方式
租金为每月人民币10000元，乙方应于每月5日前以银行转账方式支付。

第四条 不可抗力
因不可抗力导致本合同无法履行的，双方互不承担违约责任。

第五条 违约责任
任何一方违约的，应向守约方支付违约金人民币20000元，并赔偿损失。

第六条 争议解决
本合同履行过程中发生争议的，双方应协商解决；协商不成的，任何一方可向人民法院提起诉讼。

第七条 管辖
因本合同产生的纠纷，由合同履行地人民法院管辖。

第八条 保密
乙方对房屋及甲方的个人信息负有保密义务，不得向第三方泄露。
`

describe("contract_extract sectioning", () => {
  test("splitSections cuts on 第X条 markers and keeps a preface", () => {
    const sections = splitSections(CONTRACT)
    const headings = sections.map((s) => s.heading)
    expect(headings).toContain("前言")
    expect(headings).toContain("第一条")
    expect(headings).toContain("第七条")
    // 8 numbered articles
    expect(sections.filter((s) => /第[一二三四五六七八九十]+条/.test(s.heading))).toHaveLength(8)
  })

  test("splitSections falls back to paragraph splitting when no markers", () => {
    const sections = splitSections("段落一。\n\n段落二。\n\n段落三。")
    expect(sections.length).toBe(3)
    expect(sections.every((s) => s.heading.startsWith("段"))).toBe(true)
  })
})

describe("contract_extract classification", () => {
  test("classifies breach, jurisdiction, dispute resolution, force majeure correctly", () => {
    expect(classifySection({ heading: "第五条", text: "违约责任 违约金20000元 赔偿损失" })).toBe("breach")
    expect(classifySection({ heading: "第七条", text: "由合同履行地人民法院管辖" })).toBe("jurisdiction")
    expect(classifySection({ heading: "第六条", text: "争议解决 协商不成 向人民法院提起诉讼" })).toBe("disputeResolution")
    expect(classifySection({ heading: "第四条", text: "不可抗力 不能预见 不能避免" })).toBe("forceMajeure")
    expect(classifySection({ heading: "第八条", text: "保密义务 不得泄露" })).toBe("confidentiality")
    // 房屋基本情况（标的）无匹配关键词，归为其他
    expect(classifySection({ heading: "第一条", text: "甲方将房屋出租给乙方 建筑面积100平方米" })).toBe("other")
    expect(classifySection({ heading: "第三条", text: "交付 验收 运输 质量标准" })).toBe("performance")
  })

  test("returns other when no keyword matches", () => {
    expect(classifySection({ heading: "第X条", text: "本合同一式两份" })).toBe("other")
  })
})

describe("contract_extract parties", () => {
  test("extracts roles and names from the header", () => {
    const parties = extractParties(CONTRACT)
    const roles = parties.map((p) => p.role)
    expect(roles).toContain("甲方")
    expect(roles).toContain("乙方")
    const jiafang = parties.find((p) => p.role === "甲方")
    expect(jiafang?.name).toBe("张三")
    const yifang = parties.find((p) => p.role === "乙方")
    expect(yifang?.name).toBe("李四")
  })

  test("deduplicates identical role|name pairs", () => {
    const parties = extractParties("甲方：王五\n甲方：王五\n乙方：赵六")
    const wang = parties.filter((p) => p.role === "甲方" && p.name === "王五")
    expect(wang).toHaveLength(1)
    expect(parties.filter((p) => p.role === "乙方")).toHaveLength(1)
  })

  test("ignores too-short or malformed names", () => {
    expect(extractParties("甲方：x")).toHaveLength(0)
  })
})

describe("contract_extract extraction", () => {
  test("extract groups clauses and respects category filter", () => {
    const full = extract(CONTRACT)
    expect(full.sectionCount).toBeGreaterThan(0)
    expect(full.parties.length).toBe(2)

    const categories = new Set(full.clauses.map((c) => c.category))
    expect(categories.has("breach")).toBe(true)
    expect(categories.has("jurisdiction")).toBe(true)
    expect(categories.has("disputeResolution")).toBe(true)

    // category filter narrows results
    const narrow = extract(CONTRACT, ["breach", "jurisdiction"])
    const narrowCats = new Set(narrow.clauses.map((c) => c.category))
    expect(narrowCats.has("breach")).toBe(true)
    expect(narrowCats.has("jurisdiction")).toBe(true)
    expect(narrowCats.has("disputeResolution")).toBe(false)
  })

  test("formatResult renders grouped clauses with parties", () => {
    const text = formatResult(extract(CONTRACT))
    expect(text).toContain("【合同主体】")
    expect(text).toContain("甲方：张三")
    expect(text).toContain("【违约责任】")
    expect(text).toContain("【管辖】")
    expect(text).toContain("【争议解决】")
    expect(text).toContain("已抽取合同条款")
  })

  test("handles empty text without throwing", () => {
    const extraction = extract("")
    expect(extraction.parties).toEqual([])
    expect(extraction.clauses).toEqual([])
    expect(extraction.sectionCount).toBe(0)
  })
})
