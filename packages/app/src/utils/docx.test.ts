import { describe, expect, test } from "bun:test"
import { extractDocBestEffort, extractTextFromDocumentXml } from "@/utils/docx"

const XML = `<?xml version="1.0"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p><w:r><w:t>原告：张三，身份证号 110101199001011234。</w:t></w:r></w:p>
  <w:p><w:r><w:t>金额 6228 4800 1234 5678 元。</w:t><w:tab/></w:r></w:p>
  <w:p><w:r><w:t>备注</w:t><w:br/></w:r><w:r><w:t>第二行 &amp; 完毕</w:t></w:r></w:p>
</w:document>`

describe("docx text extraction", () => {
  test("extractTextFromDocumentXml reconstructs paragraphs, tabs, breaks and entities", () => {
    const text = extractTextFromDocumentXml(XML)
    expect(text).toContain("原告：张三，身份证号 110101199001011234。")
    expect(text).toContain("金额 6228 4800 1234 5678 元。\t")
    // line break inside a paragraph becomes a newline before "第二行"; &amp; decodes to &
    expect(text).toContain("备注\n第二行 & 完毕")
  })

  test("extractTextFromDocumentXml is empty for xml without text runs", () => {
    expect(extractTextFromDocumentXml("<w:p></w:p>")).toBe("")
  })

  test("extractDocBestEffort recovers readable CJK runs and flags low fidelity", () => {
    const utf16 = new Uint16Array("案号说明 原告张三 被告李四 1234".split("").map((c) => c.charCodeAt(0)))
    const out = extractDocBestEffort(new Uint8Array(utf16.buffer).buffer)
    expect(out.fidelity).toBe("low")
    expect(out.note).toContain(".docx")
    expect(out.text).toContain("原告张三")
    expect(out.text).toContain("被告李四")
  })
})
