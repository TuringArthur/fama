import { describe, expect, test } from "bun:test"
import {
  applyValues,
  parseMappingTable,
  redact,
  restore,
  restoredCopyName,
  type MappingEntry,
  type ValueEntry,
} from "./redact"

describe("restore (解除脱密)", () => {
  const sample = "原告张三（身份证号 110101199001011234）诉被告李四，联系电话 13800138000。"

  test("restore is the inverse of redact for token-free originals", () => {
    const result = redact(sample)
    expect(result.mapping.length).toBeGreaterThan(0)
    expect(restore(result.redacted, result.mapping)).toBe(sample)
  })

  test("restore is the inverse of applyValues", () => {
    const entries: ValueEntry[] = [
      { category: "name", value: "张三" },
      { category: "name", value: "李四" },
      { category: "idCard", value: "110101199001011234" },
    ]
    const result = applyValues(sample, entries)
    expect(restore(result.redacted, result.mapping)).toBe(sample)
  })

  test("restore recovers every placeholder when a document has 10+ same-category subjects", () => {
    // 构造 10 个不同姓名，使占位符覆盖到 [姓名10]，验证所有占位符都能精确还原。
    const names = Array.from({ length: 10 }, (_, i) => `测试员${i + 1}`)
    const text = names.map((n) => `当事人${n}到场。`).join("")
    const entries: ValueEntry[] = names.map((n) => ({ category: "name", value: n }))
    const result = applyValues(text, entries)
    // 换回后必须与原文逐字一致：占位符以 ] 结尾，[姓名1] 与 [姓名10] 互不为子串。
    expect(restore(result.redacted, result.mapping)).toBe(text)
  })

  test("restore leaves the text unchanged when the mapping is empty or has no usable entries", () => {
    expect(restore("含 [姓名1] 的文本", [])).toBe("含 [姓名1] 的文本")
    expect(restore("文本", [{ token: "", value: "x", category: "name" }])).toBe("文本")
  })

  test("restore replaces a placeholder that survives an AI rewrite of surrounding text", () => {
    const result = redact(sample)
    // 模拟 AI 改写了上下文，但保留了占位符。
    const rewritten = `经分析，${result.mapping[0]!.token} 的主张成立。`
    const restored = restore(rewritten, result.mapping)
    expect(restored).toContain(result.mapping[0]!.value)
    expect(restored).not.toContain(result.mapping[0]!.token)
  })
})

describe("parseMappingTable", () => {
  test("parses JSON mapping written by saveMapping (round-trip)", () => {
    const result = redact("原告张三，电话 13800138000。")
    const json = JSON.stringify(result.mapping, null, 2)
    const parsed = parseMappingTable(json)
    expect(parsed).toHaveLength(result.mapping.length)
    expect(parsed.map((m) => m.token)).toEqual(result.mapping.map((m) => m.token))
    expect(parsed.map((m) => m.value)).toEqual(result.mapping.map((m) => m.value))
    expect(restore(result.redacted, parsed)).toBe("原告张三，电话 13800138000。")
  })

  test("parses legacy Markdown table | 占位符 | 类别 | 原始值 |", () => {
    const md = [
      `# 脱密占位对照表`,
      ``,
      `> ⚠️ 仅本地保留`,
      ``,
      `| 占位符 | 类别 | 原始值 |`,
      `| --- | --- | --- |`,
      `| [姓名1] | 姓名 | 张三 |`,
      `| [手机号1] | 手机号 | 13800138000 |`,
    ].join("\n")
    const parsed = parseMappingTable(md)
    expect(parsed).toEqual([
      { token: "[姓名1]", value: "张三", category: "name" },
      { token: "[手机号1]", value: "13800138000", category: "phone" },
    ])
  })

  test("unknown category labels in Markdown fall back to custom with that label", () => {
    const md = `| [代号1] | 秘密项目X | 代号甲 |\n| [姓名1] | 姓名 | 张三 |`
    const parsed = parseMappingTable(md)
    expect(parsed[0]).toEqual({ token: "[代号1]", value: "代号甲", category: "custom", label: "秘密项目X" })
    expect(parsed[1]).toEqual({ token: "[姓名1]", value: "张三", category: "name" })
  })

  test("returns [] on garbage input", () => {
    expect(parseMappingTable("")).toEqual([])
    expect(parseMappingTable("一些没有表格或 JSON 的普通文字")).toEqual([])
  })

  test("MappingEntry[] type is accepted by restore directly", () => {
    const mapping: MappingEntry[] = [{ token: "[姓名1]", value: "王五", category: "name" }]
    expect(restore("案号：[姓名1] 胜诉。", mapping)).toBe("案号：王五 胜诉。")
  })
})

describe("restoredCopyName", () => {
  test("mirrors redactedCopyName with .还原. infix per extension", () => {
    expect(restoredCopyName("起诉状.txt")).toBe("起诉状.还原.txt")
    expect(restoredCopyName("案件.MD")).toBe("案件.还原.md")
    expect(restoredCopyName("判决书.docx")).toBe("判决书.还原.docx")
    expect(restoredCopyName("旧件.doc")).toBe("旧件.还原.docx")
    expect(restoredCopyName("data.json")).toBe("data.还原.md")
    expect(restoredCopyName("无后缀文件")).toBe("无后缀文件.还原.txt")
    expect(restoredCopyName("C:\\dir\\报告.docx")).toBe("报告.还原.docx")
  })
})
