import { describe, expect, test } from "bun:test"
import {
  buildMapping,
  CATEGORY_LABELS,
  detect,
  redact,
  redactedCopyName,
  summarize,
} from "@fama-ai/core/redact"

const PLAINT = `
民事起诉状

原告：张三，男，身份证号 110101199001011234，联系电话 13800138000。
被告：北京某某科技有限公司，住所地北京市朝阳区建国路88号。
被告法定代表人：李四，电话 010-87654321。

诉讼请求：
1. 判令被告支付货款人民币 6228480012345678 元；
2. 本案诉讼费用由被告承担。

原告邮箱：zhangsan@example.com，车牌号 京A12345。
本案涉国家秘密，请按保密规定处理。
案号：(2024)京01民初123号。
`

describe("redact detect", () => {
  test("detects id card, phone, email, bank card, plate", () => {
    const findings = detect(PLAINT)
    const cats = new Set(findings.map((f) => f.category))
    expect(cats.has("idCard")).toBe(true)
    expect(cats.has("phone")).toBe(true)
    expect(cats.has("bankCard")).toBe(true)
    expect(cats.has("email")).toBe(true)
    expect(cats.has("licensePlate")).toBe(true)
  })

  test("detects secret marks", () => {
    const findings = detect(PLAINT)
    const secret = findings.filter((f) => f.category === "secretMark")
    expect(secret.length).toBeGreaterThan(0)
    expect(secret.some((f) => f.value.includes("国家秘密"))).toBe(true)
  })

  test("detects detailed addresses (municipality + province forms)", () => {
    const text =
      "被告住所地北京市朝阳区建国路88号。原告住址：上海市浦东新区张江路100号。"
    const findings = detect(text).filter((f) => f.category === "address").map((f) => f.value)
    expect(findings.some((v) => v.includes("北京市朝阳区"))).toBe(true)
    expect(findings.some((v) => v.includes("上海市浦东新区"))).toBe(true)
    // addresses should not absorb the leading label
    expect(findings.every((v) => !v.includes("：") && !v.includes("址"))).toBe(true)
  })

  test("detects contextual names with legal/contract roles", () => {
    const findings = detect("原告：王五，男，1980年生。被告：赵六。")
    const names = findings.filter((f) => f.category === "name").map((f) => f.value)
    expect(names).toContain("王五")
    expect(names).toContain("赵六")
  })

  test("keeps case numbers intact (public info, not secret)", () => {
    const findings = detect("案号：(2024)京01民初123号。")
    const values = findings.map((f) => f.value)
    expect(values.some((v) => v.includes("案号") || v.includes("2024"))).toBe(false)
  })

  test("findings do not overlap (each char claimed once)", () => {
    const findings = detect(PLAINT)
    for (let i = 0; i < findings.length; i++) {
      for (let j = i + 1; j < findings.length; j++) {
        const a = findings[i]!
        const b = findings[j]!
        const overlap = a.start < b.end && b.start < a.end
        expect(overlap).toBe(false)
      }
    }
  })
})

describe("redact redact", () => {
  test("replaces sensitive values with stable placeholders", () => {
    const result = redact(PLAINT)
    expect(result.redacted).toContain("[身份证号1]")
    expect(result.redacted).toContain("[手机号1]")
    expect(result.redacted).toContain("[邮箱1]")
    expect(result.redacted).not.toContain("13800138000")
    expect(result.redacted).not.toContain("110101199001011234")
    // case number remains (public)
    expect(result.redacted).toContain("(2024)京01民初123号")
  })

  test("same value maps to same token across the document", () => {
    const text = "原告：张三诉被告违约。被告：李四，女。又查，原告：张三称欠款。"
    const result = redact(text)
    const zhangsanToken = result.mapping.find((m) => m.value === "张三")?.token
    expect(zhangsanToken).toBeTruthy()
    // every occurrence of 张三 should have been replaced by that token
    expect(result.redacted.includes("张三")).toBe(false)
    const occurrences = result.redacted.split(zhangsanToken!).length - 1
    expect(occurrences).toBeGreaterThanOrEqual(2)
  })

  test("category filter narrows what gets redacted", () => {
    const result = redact(PLAINT, { categories: ["idCard", "phone"] })
    const cats = new Set(Object.keys(result.stats))
    expect(cats.has("idCard")).toBe(true)
    expect(cats.has("phone")).toBe(true)
    // email still present when not in filter
    expect(result.redacted).toContain("zhangsan@example.com")
    expect(result.redacted).not.toContain("110101199001011234")
  })

  test("id card wins over bank card on 18-digit id (priority)", () => {
    const text = "身份证 110101199001011234。"
    const result = redact(text)
    expect(result.stats.idCard).toBe(1)
    expect(result.stats.bankCard ?? 0).toBe(0)
    expect(result.redacted).toContain("[身份证号1]")
  })

  test("scope hits reflect national secret / commercial secret / personal privacy", () => {
    const result = redact(PLAINT)
    expect(result.scopeHits.nationalSecret).toBe(true)
    expect(result.scopeHits.commercialSecret).toBe(true) // 企业名称
    expect(result.scopeHits.personalPrivacy).toBe(true)
  })

  test("handles empty text without throwing", () => {
    const result = redact("")
    expect(result.findings).toEqual([])
    expect(result.redacted).toBe("")
    expect(result.scopeHits.nationalSecret).toBe(false)
  })

  test("handles text with no sensitive info", () => {
    const result = redact("这是一段关于买卖合同纠纷的法律分析，不涉及任何个人信息。")
    expect(result.findings.length).toBe(0)
  })
})

describe("redact mapping", () => {
  test("buildMapping assigns sequential tokens per category and dedupes", () => {
    const findings = detect("原告：张三。被告：李四。原告：张三。")
    const mapping = buildMapping(findings)
    const tokens = mapping.map((m) => m.token)
    expect(tokens).toContain("[姓名1]")
    expect(tokens).toContain("[姓名2]")
    // 张三 deduped to a single entry
    expect(mapping.filter((m) => m.value === "张三")).toHaveLength(1)
    expect(mapping.filter((m) => m.value === "李四")).toHaveLength(1)
  })

  test("token labels use CATEGORY_LABELS", () => {
    const mapping = buildMapping(detect(PLAINT))
    for (const m of mapping) {
      expect(m.token).toContain(CATEGORY_LABELS[m.category])
    }
  })
})

describe("redact summarize", () => {
  test("summarize reports counts, scope warning, and mapping preview", () => {
    const summary = summarize(redact(PLAINT))
    expect(summary).toContain("脱密完成")
    expect(summary).toContain("国家秘密")
    expect(summary).toContain("个人隐私")
    expect(summary).toContain("占位对照表")
    // preview should not leak full id card
    expect(summary.includes("110101199001011234")).toBe(false)
  })

  test("summarize handles a clean document gracefully", () => {
    const summary = summarize(redact("无敏感信息的普通段落。"))
    expect(summary).toContain("脱密完成")
    expect(summary).toContain("共发现 0 处")
  })
})

describe("redact redactedCopyName", () => {
  test("appends 脱密 suffix to readable extensions", () => {
    expect(redactedCopyName("起诉状.txt")).toBe("起诉状.脱密.txt")
    expect(redactedCopyName("起诉状.md")).toBe("起诉状.脱密.md")
  })

  test("normalizes non-readable types to markdown", () => {
    expect(redactedCopyName("起诉状.docx")).toBe("起诉状.脱密.md")
    expect(redactedCopyName("file")).toBe("file.脱密.txt")
  })
})

describe("redact customRules", () => {
  test("redacts user-defined patterns with [名称N] placeholders", () => {
    const text = "甲方与甲方就 项目代号 猎鹰 达成协议。猎鹰二期另议。"
    const result = redact(text, { customRules: [{ name: "项目代号", pattern: "猎鹰" }] })
    expect(result.redacted).toContain("[项目代号1]")
    // 猎鹰 出现两次但同一值只占用一个占位符
    const tokens = result.redacted.match(/\[项目代号1\]/g) ?? []
    expect(tokens.length).toBe(2)
    expect(result.mapping.find((m) => m.label === "项目代号" && m.value === "猎鹰")).toBeTruthy()
  })

  test("custom rules are applied even when a built-in category filter is set", () => {
    const text = "代号 猎鹰，电话 13800138000。"
    const result = redact(text, {
      categories: ["idCard"], // 排除了 phone
      customRules: [{ name: "代号", pattern: "猎鹰" }],
    })
    expect(result.redacted).toContain("[代号1]")
    expect(result.redacted).toContain("13800138000") // phone 未在白名单，原文保留
  })

  test("custom rule wins over built-in when spans overlap", () => {
    const text = "北京某某科技有限公司败诉。"
    const built = redact(text)
    expect(built.redacted).toContain("[企业名称1]")
    const custom = redact(text, { customRules: [{ name: "涉密企业", pattern: "北京某某科技有限公司" }] })
    expect(custom.redacted).toContain("[涉密企业1]")
    expect(custom.redacted).not.toContain("[企业名称")
  })

  test("invalid custom regex is ignored without failing the run", () => {
    const text = "原告：张三。"
    const result = redact(text, { customRules: [{ name: "坏规则", pattern: "([0-9" }] })
    expect(result.redacted).toContain("[姓名1]")
    expect(result.mapping.find((m) => m.label === "坏规则")).toBeUndefined()
  })

  test("detect accepts customRules option", () => {
    const findings = detect("代号为猎鹰。", { customRules: [{ name: "代号", pattern: "猎鹰" }] })
    const custom = findings.filter((f) => f.category === "custom")
    expect(custom.length).toBe(1)
    expect(custom[0]?.label).toBe("代号")
  })
})
