import { describe, expect, test } from "bun:test"
import {
  buildDocx,
  extractDocBestEffort,
  extractDocx,
  extractTextFromDocumentXml,
} from "@/utils/docx"

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

describe("docx buildDocx roundtrip", () => {
  test("buildDocx -> extractDocx round-trips the text (STORE path)", async () => {
    const text = "原告：张三\n被告：李四\n金额 6228 4800 1234 5678 元"
    const bytes = buildDocx(text)
    expect(bytes.byteLength).toBeGreaterThan(0)
    const out = await extractDocx(bytes)
    expect(out.fidelity).toBe("high")
    expect(out.text).toContain("原告：张三")
    expect(out.text).toContain("被告：李四")
    expect(out.text).toContain("6228 4800 1234 5678")
  })

  test("buildDocx escapes XML-special characters", async () => {
    const out = await extractDocx(buildDocx("a < b & c > d"))
    expect(out.text).toContain("a < b & c > d")
  })

  test("readZipEntries handles DEFLATE-compressed entries (real Word docx path)", async () => {
    // 用 CompressionStream(deflate-raw) 造一个单条目的 deflate zip，验证解压链路。
    const raw = new TextEncoder().encode(
      '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t xml:space="preserve">被告：李四。</w:t></w:r></w:p></w:body></w:document>',
    )
    const cs = new CompressionStream("deflate-raw")
    const w = cs.writable.getWriter()
    w.write(raw)
    w.close()
    const chunks: Uint8Array[] = []
    const r = cs.readable.getReader()
    for (;;) {
      const { done, value } = await r.read()
      if (done) break
      chunks.push(value as Uint8Array)
    }
    const comp = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
    let off = 0
    for (const c of chunks) {
      comp.set(c, off)
      off += c.length
    }
    // 手工拼一个最小 zip：本地头(STORE 不行，这里写 method=8) + 中央目录 + EOCD
    const name = new TextEncoder().encode("word/document.xml")
    const local = new Uint8Array(30 + name.length + comp.length)
    const dv = new DataView(local.buffer)
    dv.setUint32(0, 0x04034b50, true)
    dv.setUint16(8, 8, true) // method = deflate
    dv.setUint16(12, 0x0021, true)
    dv.setUint32(18, comp.length, true)
    dv.setUint32(22, raw.length, true)
    dv.setUint16(26, name.length, true)
    local.set(name, 30)
    local.set(comp, 30 + name.length)
    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(10, 8, true)
    cv.setUint16(14, 0x0021, true)
    cv.setUint32(20, comp.length, true)
    cv.setUint32(24, raw.length, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, 0, true) // local offset
    central.set(name, 46)
    const eocd = new Uint8Array(22)
    const ev = new DataView(eocd.buffer)
    ev.setUint32(0, 0x06054b50, true)
    ev.setUint16(8, 1, true)
    ev.setUint16(10, 1, true)
    ev.setUint32(12, central.length, true)
    ev.setUint32(16, local.length, true)
    const zip = new Uint8Array(local.length + central.length + eocd.length)
    zip.set(local, 0)
    zip.set(central, local.length)
    zip.set(eocd, local.length + central.length)
    const out = await extractDocx(zip)
    expect(out.text).toContain("被告：李四。")
  })

  test("extractDocx flags low fidelity when document.xml is not valid OOXML (guard)", async () => {
    // 手工拼一个 STORE(method=0) zip，其 word/document.xml 内容为非 XML 乱码，
    // 验证 extractDocx 不会把乱码当文本回传，而是给出明确的低保真提示。
    const garbage = new TextEncoder().encode("PK\x03\x04 这不是合法的 OOXML")
    const name = new TextEncoder().encode("word/document.xml")
    const local = new Uint8Array(30 + name.length + garbage.length)
    const dv = new DataView(local.buffer)
    dv.setUint32(0, 0x04034b50, true)
    dv.setUint16(8, 0, true) // store
    dv.setUint16(12, 0x0021, true)
    dv.setUint32(18, garbage.length, true)
    dv.setUint32(22, garbage.length, true)
    dv.setUint16(26, name.length, true)
    local.set(name, 30)
    local.set(garbage, 30 + name.length)
    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(10, 0, true)
    cv.setUint16(14, 0x0021, true)
    cv.setUint32(20, garbage.length, true)
    cv.setUint32(24, garbage.length, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, 0, true)
    central.set(name, 46)
    const eocd = new Uint8Array(22)
    const ev = new DataView(eocd.buffer)
    ev.setUint32(0, 0x06054b50, true)
    ev.setUint16(8, 1, true)
    ev.setUint16(10, 1, true)
    ev.setUint32(12, central.length, true)
    ev.setUint32(16, local.length, true)
    const zip = new Uint8Array(local.length + central.length + eocd.length)
    zip.set(local, 0)
    zip.set(central, local.length)
    zip.set(eocd, local.length + central.length)
    const out = await extractDocx(zip)
    expect(out.fidelity).toBe("low")
    expect(out.text).toBe("")
    expect(out.note).toContain("非合法 OOXML")
  })
})
