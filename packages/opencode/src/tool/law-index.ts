import { Database } from "bun:sqlite"
import path from "path"

// Local statute index (built by script/build-law-index.ts into data/fama-laws.db).
// Purely offline: searchArticles / getArticle / verifyCitations all read the
// bundled SQLite FTS5 (trigram) index. The index is optional — every entry
// point returns undefined/empty when it is absent so callers fall back to
// their online paths.

// Environment override for packaged builds; in development this resolves to
// the repo-root data directory (src/tool -> src -> opencode -> packages -> root).
const INDEX_ENV = "FAMA_LAW_INDEX"

let cached: Database | undefined
let probed: boolean | undefined

function openIndex(): Database | undefined {
  if (probed) return cached
  probed = true
  const candidates = [
    process.env[INDEX_ENV],
    path.resolve(import.meta.dir, "../../../../data/fama-laws.db"),
  ].filter((p): p is string => !!p)
  for (const candidate of candidates) {
    try {
      cached = new Database(candidate, { readonly: true })
      return cached
    } catch {
      continue
    }
  }
  return undefined
}

export function isIndexAvailable(): boolean {
  return openIndex() !== undefined
}

const CN_DIGITS: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }
const CN_UNITS: Record<string, number> = { 十: 10, 百: 100, 千: 1000 }
const SUFFIX_ORD: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5 }

/** 第五百七十七条 -> 577. A digit replaces the pending value, a unit accumulates. */
export function cnNumberToInt(input: string): number | undefined {
  const s = input.replace(/〇/g, "零").trim()
  if (!s) return undefined
  if (/^[0-9]+$/.test(s)) return Number(s)
  let result = 0
  let num = 0
  for (const ch of s) {
    const d = CN_DIGITS[ch]
    if (d !== undefined) {
      num = d
      continue
    }
    const unit = CN_UNITS[ch]
    if (unit) {
      result += (num === 0 ? 1 : num) * unit
      num = 0
    } else if (ch === "万") {
      result = (result + num) * 10000
      num = 0
    } else if (ch === "零") {
      continue
    } else {
      return undefined
    }
  }
  return result + num
}

const CN_DIGIT_NAMES = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"]

/** 577 -> 五百七十七 (numbers below 10000, the range statute articles use). */
export function intToCnNumber(value: number): string | undefined {
  if (!Number.isInteger(value) || value < 0 || value >= 10000) return undefined
  if (value < 10) return CN_DIGIT_NAMES[value]!
  const thousands = Math.floor(value / 1000)
  const hundreds = Math.floor((value % 1000) / 100)
  const tens = Math.floor((value % 100) / 10)
  const ones = value % 10
  const parts: string[] = []
  if (thousands) parts.push(CN_DIGIT_NAMES[thousands]! + "千")
  if (hundreds) parts.push(CN_DIGIT_NAMES[hundreds]! + "百")
  else if (thousands && (tens || ones)) parts.push("零")
  if (tens === 1 && !hundreds && !thousands) parts.push("十")
  else if (tens === 1) parts.push("一十")
  else if (tens > 1) parts.push(CN_DIGIT_NAMES[tens]! + "十")
  if (ones) parts.push(CN_DIGIT_NAMES[ones]!)
  return parts.join("")
}

/** "第五百七十七条之一" / "577之一" -> { ord: 577, suffix: 1 }. */
export function parseArticleRef(input: string): { ord: number; suffix?: number } | undefined {
  const match = input
    .trim()
    .replace(/^第/, "")
    .replace(/条$/, "")
    .match(/^([零〇一二三四五六七八九十百千万两0-9]+)(?:之([一二三四五]))?$/)
  if (!match) return undefined
  const ord = cnNumberToInt(match[1]!)
  if (ord === undefined) return undefined
  const suffix = match[2] ? SUFFIX_ORD[match[2]] : undefined
  return { ord, suffix }
}

function articleNumExact(ref: { ord: number; suffix?: number }): string | undefined {
  const cn = intToCnNumber(ref.ord)
  if (!cn) return undefined
  const suffix = ref.suffix ? `之${Object.entries(SUFFIX_ORD).find(([, v]) => v === ref.suffix)?.[0]}` : ""
  return `第${cn}条${suffix}`
}

/** Quote whitespace-separated terms as FTS5 phrase strings. */
export function ftsEscape(query: string): string {
  return query
    .trim()
    .split(/\s+/)
    .map((term) => `"${term.replaceAll('"', '""')}"`)
    .join(" ")
}

export type ArticleHit = { lawTitle: string; category: string; num: string; chapter: string; content: string }

export function searchArticles(query: string, limit = 8): ArticleHit[] {
  const db = openIndex()
  if (!db) return []
  const fts = ftsEscape(query)
  if (!fts) return []
  const rows = db
    .prepare(
      'SELECT l.title AS "lawTitle", l.category AS "category", a.num AS "num", a.chapter AS "chapter", a.content AS "content" ' +
        "FROM articles_fts f JOIN articles a ON a.id = f.rowid JOIN laws l ON l.id = a.law_id " +
        "WHERE articles_fts MATCH ?1 LIMIT ?2",
    )
    .all(fts, limit) as ArticleHit[]
  return rows
}

export function searchLawTitles(query: string, limit = 8): { title: string; category: string }[] {
  const db = openIndex()
  if (!db) return []
  const fts = ftsEscape(query)
  if (!fts) return []
  return db
    .prepare(
      'SELECT l.title AS "title", l.category AS "category" FROM laws_fts f JOIN laws l ON l.id = f.rowid ' +
        "WHERE laws_fts MATCH ?1 LIMIT ?2",
    )
    .all(fts, limit) as { title: string; category: string }[]
}

export function getArticle(lawQuery: string, articleInput: string | number): ArticleHit | undefined {
  const db = openIndex()
  if (!db) return undefined
  const name = lawQuery.replaceAll(/[《》\s]/g, "").trim()
  if (!name) return undefined
  const ref = parseArticleRef(String(articleInput))
  if (!ref) return undefined
  const laws = db
    .prepare("SELECT id FROM laws WHERE title = ?1 OR title LIKE ?2 ORDER BY (title = ?1) DESC, LENGTH(title) ASC LIMIT 20")
    .all(name, `%${name}%`) as { id: number }[]
  if (laws.length === 0) return undefined
  const ids = laws.map((l) => l.id)
  const exact = articleNumExact(ref)
  // Query per law id, in preference order (exact title first, then shortest).
  const stmt = exact
    ? db.prepare(
        'SELECT l.title AS "lawTitle", l.category AS "category", a.num AS "num", a.chapter AS "chapter", a.content AS "content" FROM articles a JOIN laws l ON l.id = a.law_id WHERE a.law_id = ?1 AND a.num = ?2 LIMIT 1',
      )
    : db.prepare(
        'SELECT l.title AS "lawTitle", l.category AS "category", a.num AS "num", a.chapter AS "chapter", a.content AS "content" FROM articles a JOIN laws l ON l.id = a.law_id WHERE a.law_id = ?1 AND a.num_ord = ?2 LIMIT 1',
      )
  for (const id of ids) {
    const row = stmt.get(id, exact ?? ref.ord) as ArticleHit | undefined
    if (row) return row
  }
  return undefined
}

export type CitationStatus = { law: string; article: string; state: "verified" | "law-only" | "unknown"; found: string }

/** Extract 《法名》第X条 references and check each against the local index. */
export function verifyCitations(text: string): CitationStatus[] {
  const cleaned = text.replace(/《([^》]{2,50})》第([零〇一二三四五六七八九十百千万两0-9]+)条至第([零〇一二三四五六七八九十百千万两0-9]+)条/g, (m, law, from, to) => {
    const a = cnNumberToInt(from)
    const b = cnNumberToInt(to)
    if (a === undefined || b === undefined) return m
    const cn = intToCnNumber(a)
    return cn ? `《${law}》第${cn}条` : m
  })
  const seen = new Set<string>()
  const out: CitationStatus[] = []
  const pattern = /《([^》]{2,50})》第([零〇一二三四五六七八九十百千万两0-9]+)条(之一|之二|之三|之四|之五)?/g
  for (const match of cleaned.matchAll(pattern)) {
    const law = match[1]!.trim()
    const ref = parseArticleRef(`${match[2]}条${match[3] ?? ""}`)
    if (!ref) continue
    const key = `${law}#${match[2]}#${match[3] ?? ""}`
    if (seen.has(key)) continue
    seen.add(key)
    const displayNum = `第${match[2]}条${match[3] ?? ""}`
    const hit = getArticle(law, `${ref.ord}${ref.suffix ? `之${Object.entries(SUFFIX_ORD).find(([, v]) => v === ref.suffix)?.[0]}` : ""}`)
    if (hit) {
      out.push({ law, article: displayNum, state: "verified", found: hit.lawTitle })
    } else {
      const lawHit = searchLawTitles(law, 1)
      out.push({ law, article: displayNum, state: lawHit.length > 0 ? "law-only" : "unknown", found: lawHit[0]?.title ?? "" })
    }
  }
  return out
}
