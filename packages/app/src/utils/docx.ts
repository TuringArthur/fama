// 从 Office 文档抽取纯文本，供脱密引擎处理。全部在渲染进程本地完成，不上传任何内容。
//
// - .docx：ZIP 容器内的 word/document.xml，结构化抽取（高保真，可靠）。
// - .doc：旧二进制 OLE 格式，浏览器/渲染进程内无可靠解析库；做「最大努力」的文本扫描
//   （按 UTF-16 / UTF-8 解码后抽取可读片段），并标注为低保真，提示用户改存为 .docx。

export type ExtractedText = {
  text: string
  fidelity: "high" | "low"
  // 解析提示，例如「旧 .doc 低保真，建议另存为 .docx」。
  note?: string
}

export type ExtractError = { ok: false; reason: string }
export type ExtractResult = ExtractedText | ExtractError

export function isExtractError(value: ExtractResult): value is ExtractError {
  return (value as ExtractError).ok === false
}

// word/document.xml -> 纯文本：按段落与制表/换行还原可读结构。
// 纯函数（无 DOMParser 依赖），便于单测。
// 关键：`<w:t` 后必须紧跟 `>` 或空白属性（`<w:t>` / `<w:t xml:space="preserve">`），
// 否则会错误地吞掉 `<w:tbl>`/`<w:tr>`/`<w:tc>`（表格）等同样以 `<w:t` 开头的元素，
// 把其中的属性标记（`<w:left .../>`、`<w:pBdr>`、`<w:shd>` 等）当成正文回传。
const W_TOKEN = /<\/w:p>|<w:tab\b[^>]*\/?>|<w:br\b[^>]*\/?>|<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:cr\b[^>]*\/?>/g
const ENTITY = /&amp;|&lt;|&gt;|&quot;|&apos;|&#(\d+);/g

function decodeEntity(match: string, code?: string): string {
  if (code !== undefined) return String.fromCodePoint(Number(code))
  switch (match) {
    case "&amp;":
      return "&"
    case "&lt;":
      return "<"
    case "&gt;":
      return ">"
    case "&quot;":
      return '"'
    case "&apos;":
      return "'"
    default:
      return match
  }
}

export function extractTextFromDocumentXml(xml: string): string {
  let out = ""
  for (const match of xml.matchAll(W_TOKEN)) {
    const token = match[0]
    if (token.startsWith("</w:p>")) {
      out += "\n"
      continue
    }
    if (token.startsWith("<w:tab")) {
      out += "\t"
      continue
    }
    if (token.startsWith("<w:br") || token.startsWith("<w:cr")) {
      out += "\n"
      continue
    }
    const inner = match[1]
    if (inner !== undefined) out += inner.replace(ENTITY, decodeEntity)
  }
  return out.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
}

// —— 自带 zip 解析（不依赖 zip.js）——
// zip.js 的 ZipReader.getData 在部分运行时（如本项目的 Bun 测试 + 某些 Electron 渲染层）
// 会对只读属性 `writable.size = 0` 赋值而崩溃，导致 .docx 抽取失败。这里直接按 ZIP
// 规范解析中央目录 + 本地文件头，对 DEFLATE(method 8) 用浏览器的 DecompressionStream 解压。
type ZipEntry = { name: string; method: number; bytes: Uint8Array }

function findEocd(view: DataView): number {
  const min = 22
  const maxBack = Math.min(view.byteLength, 65557)
  for (let i = view.byteLength - min; i >= view.byteLength - maxBack; i--) {
    if (
      view.getUint32(i, true) === 0x06054b50 // EOCD signature
    ) {
      return i
    }
  }
  return -1
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw")
  const writer = ds.writable.getWriter()
  // 复制一份 ArrayBuffer 支撑的副本，规避 TS5.7 下 Uint8Array<ArrayBufferLike> 与 BufferSource 的不兼容。
  writer.write(new Uint8Array(bytes))
  writer.close()
  const reader = ds.readable.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value as Uint8Array)
    total += (value as Uint8Array).length
  }
  const out = new Uint8Array(total)
  let off = 0
  for (const c of chunks) {
    out.set(c, off)
    off += c.length
  }
  return out
}

async function readZipEntries(bytes: Uint8Array): Promise<ZipEntry[]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const eocd = findEocd(view)
  if (eocd < 0) throw new Error("invalid zip: end-of-central-directory not found")
  const cdOffset = view.getUint32(eocd + 16, true)
  const total = view.getUint16(eocd + 10, true)
  const entries: ZipEntry[] = []
  let p = cdOffset
  for (let n = 0; n < total; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) break // central directory header
    const method = view.getUint16(p + 10, true)
    const compSize = view.getUint32(p + 20, true)
    const nameLen = view.getUint16(p + 28, true)
    const extraLen = view.getUint16(p + 30, true)
    const commentLen = view.getUint16(p + 32, true)
    const localOffset = view.getUint32(p + 42, true)
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen))
    // 本地文件头里有独立的 nameLen/extraLen，用以定位真实数据起点
    const localNameLen = view.getUint16(localOffset + 26, true)
    const localExtraLen = view.getUint16(localOffset + 28, true)
    const dataStart = localOffset + 30 + localNameLen + localExtraLen
    const comp = bytes.subarray(dataStart, dataStart + compSize)
    const data = method === 0 ? comp : await inflateRaw(comp)
    entries.push({ name, method, bytes: data })
    p += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

// 判断解压出的字节是否确实是 OOXML：成功解压的内容至少应含 <document 根。
// 用于防御性兜底——若运行时缺少 DecompressionStream、或解压链路产出非 XML 的乱码，
// 直接判定失败并给出明确提示，避免把乱码/原文 XML 当成「正常文本」回传给用户。
function looksLikeDocumentXml(xml: string): boolean {
  return xml.includes("<document") || xml.includes("<w:document")
}

// .docx 文本抽取：解压 word/document.xml 后结构化还原。接受 ArrayBuffer 或 Uint8Array。
export async function extractDocx(data: ArrayBuffer | Uint8Array): Promise<ExtractedText> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  const entries = await readZipEntries(bytes)
  const doc = entries.find((e) => e.name === "word/document.xml")
  if (!doc) return { text: "", fidelity: "low", note: "未在 .docx 中找到 word/document.xml" }
  const xml = new TextDecoder().decode(doc.bytes)
  // 解压得到的不是合法 OOXML：通常意味着解压链路异常（运行时不支持 deflate-raw
  // 或 zip 解析错位），此时直接失败而非把乱码当文本。
  if (!looksLikeDocumentXml(xml))
    return {
      text: "",
      fidelity: "low",
      note: "未能正确解压 .docx（word/document.xml 解码后非合法 OOXML）；请确认运行时支持 deflate-raw，或改存为 .txt/.md 后再脱密。",
    }
  return { text: extractTextFromDocumentXml(xml), fidelity: "high" }
}

// 旧 .doc（OLE 二进制）最大努力抽取：按多种编码解码后，保留 CJK + 可读 ASCII 片段。
// 不可靠，仅作兜底；命中量不足时返回空并提示用户改存为 .docx。
const READABLE_RUN = /[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffefA-Za-z0-9][\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303fA-Za-z0-9_\-.,;:()%/&@+#\s]{1,200}/g

function scanReadableRuns(decoded: string): string {
  const runs = decoded.match(READABLE_RUN)
  if (!runs) return ""
  return runs
    .map((r) => r.replace(/\s+/g, " ").trim())
    .filter((r) => r.length >= 2)
    .join("\n")
}

export function extractDocBestEffort(buffer: ArrayBuffer): ExtractedText {
  const view = new Uint8Array(buffer)
  const candidates = [
    new TextDecoder("utf-16le", { fatal: false }).decode(view),
    new TextDecoder("utf-8", { fatal: false }).decode(view),
    new TextDecoder("latin1", { fatal: false }).decode(view),
  ]
  let best = ""
  for (const decoded of candidates) {
    const scanned = scanReadableRuns(decoded)
    if (scanned.length > best.length) best = scanned
  }
  return {
    text: best,
    fidelity: "low",
    note:
      "旧版 .doc 为二进制格式，浏览器内解析不可靠，已做最大努力抽取；建议先用 Word 另存为 .docx 后再脱密。",
  }
}

// 按文件名后缀分发：.docx/.docm 走结构化抽取；.doc 走最大努力；其余返回不支持。
export async function extractOfficeText(file: File): Promise<ExtractResult> {
  const name = file.name.toLowerCase()
  const buffer = await file.arrayBuffer()
  if (name.endsWith(".docx") || name.endsWith(".docm")) {
    try {
      return await extractDocx(buffer)
    } catch (error) {
      return { ok: false, reason: `解析 .docx 失败：${String(error)}` }
    }
  }
  if (name.endsWith(".doc")) return extractDocBestEffort(buffer)
  return { ok: false, reason: `暂不支持该格式：${file.name}` }
}

// 把脱密后的纯文本打包成一份最小但合法的 .docx，使副本与源文件同后缀且可直接用 Word 打开。
const XML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;" }
const escapeXml = (s: string) => s.replace(/[&<>]/g, (c) => XML_ESCAPES[c]!)

function documentXml(text: string): string {
  // 每个段落一个 <w:p>，保留空行；长行按既有的换行自然分段。
  const paragraphs = text.replace(/\r\n/g, "\n").split("\n").map(escapeXml)
  const body = paragraphs.map((p) => `<w:p><w:r><w:t xml:space="preserve">${p}</w:t></w:r></w:p>`).join("")
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`
}

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`

const ROOT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`

// 把脱密后的纯文本打包成一份最小但合法的 .docx，使副本与源文件同后缀且可直接用 Word 打开。
// 这里用自带的「仅存储（STORE，无压缩）」zip 写出器 + CRC32，不依赖 zip.js 的 ZipWriter
// （后者在某些运行时里写入器初始化会因属性只读而抛错），更稳、无外部依赖、字节可控。
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let i = 0
  for (const p of parts) {
    out.set(p, i)
    i += p.length
  }
  return out
}

function buildZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let offset = 0
  for (const f of files) {
    const name = new TextEncoder().encode(f.name)
    const crc = crc32(f.data)
    const size = f.data.length
    const local = new Uint8Array(30 + name.length)
    const dv = new DataView(local.buffer)
    dv.setUint32(0, 0x04034b50, true) // local file header signature
    dv.setUint16(4, 20, true) // version needed to extract
    dv.setUint16(6, 0, true) // flags
    dv.setUint16(8, 0, true) // compression method = store
    dv.setUint16(10, 0, true) // mod time
    dv.setUint16(12, 0x0021, true) // mod date (1980-01-01，非零避免边界问题)
    dv.setUint32(14, crc, true)
    dv.setUint32(18, size, true) // compressed size
    dv.setUint32(22, size, true) // uncompressed size
    dv.setUint16(26, name.length, true)
    dv.setUint16(28, 0, true) // extra length
    local.set(name, 30)
    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true) // central directory header signature
    cv.setUint16(4, 20, true) // version made by
    cv.setUint16(6, 20, true) // version needed
    cv.setUint16(8, 0, true) // flags
    cv.setUint16(10, 0, true) // method = store
    cv.setUint16(12, 0, true) // time
    cv.setUint16(14, 0x0021, true) // date
    cv.setUint32(16, crc, true)
    cv.setUint32(20, size, true)
    cv.setUint32(24, size, true)
    cv.setUint16(28, name.length, true)
    cv.setUint16(30, 0, true) // extra
    cv.setUint16(32, 0, true) // comment
    cv.setUint16(34, 0, true) // disk number start
    cv.setUint16(36, 0, true) // internal attrs
    cv.setUint32(38, 0, true) // external attrs
    cv.setUint32(42, offset, true) // local header offset
    central.set(name, 46)
    localParts.push(local, f.data)
    centralParts.push(central)
    offset += local.length + f.data.length
  }
  const local = concatBytes(localParts)
  const central = concatBytes(centralParts)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true) // end of central directory signature
  ev.setUint16(4, 0, true) // disk number
  ev.setUint16(6, 0, true) // disk with central directory
  ev.setUint16(8, files.length, true)
  ev.setUint16(10, files.length, true)
  ev.setUint32(12, central.length, true)
  ev.setUint32(16, offset, true) // central directory offset
  ev.setUint16(20, 0, true) // comment length
  return concatBytes([local, central, end])
}

export function buildDocx(text: string): Uint8Array {
  const enc = new TextEncoder()
  return buildZip([
    { name: "[Content_Types].xml", data: enc.encode(CONTENT_TYPES_XML) },
    { name: "_rels/.rels", data: enc.encode(ROOT_RELS_XML) },
    { name: "word/document.xml", data: enc.encode(documentXml(text)) },
  ])
}
