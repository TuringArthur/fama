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
const W_TOKEN = /<\/w:p>|<w:tab\b[^>]*\/?>|<w:br\b[^>]*\/?>|<w:t[^>]*>([\s\S]*?)<\/w:t>|<w:cr\b[^>]*\/?>/g
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

// .docx 文本抽取：解压 word/document.xml 后结构化还原。
export async function extractDocx(buffer: ArrayBuffer): Promise<ExtractedText> {
  const { ZipReader, BlobReader, TextWriter } = await import("@zip.js/zip.js")
  const reader = new ZipReader(new BlobReader(new Blob([buffer])))
  try {
    const entries = await reader.getEntries()
    const doc = entries.find((e) => e.filename === "word/document.xml")
    if (!doc || !doc.getData) {
      return { text: "", fidelity: "low", note: "未在 .docx 中找到 word/document.xml" }
    }
    const xml = await doc.getData(new TextWriter())
    return { text: extractTextFromDocumentXml(xml), fidelity: "high" }
  } finally {
    await reader.close()
  }
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
