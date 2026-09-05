#!/usr/bin/env bun
/**
 * Build the local statute index (data/fama-laws.db) from the statute
 * markdown files under data/laws/ (one file per statute).
 *
 * Schema:
 *   laws(id, title, category, file, meta)         one row per statute file
 *   articles(id, law_id, num, num_ord, chapter, content)  one row per 条
 *   laws_fts / articles_fts                       FTS5 trigram indexes
 *
 * The DB is a build artifact (gitignored): product packaging ships it, dev
 * machines run `bun script/build-law-index.ts` once.
 *
 * Usage: bun script/build-law-index.ts [--out data/fama-laws.db]
 */

import { Database } from "bun:sqlite"
import { mkdir, readdir, rm } from "fs/promises"
import path from "path"
import { cnNumberToInt, ftsEscape } from "../packages/opencode/src/tool/law-index"

const root = path.resolve(import.meta.dir, "..")
const args = Bun.argv.slice(2)
const out = args.includes("--out")
  ? path.resolve(root, args[args.indexOf("--out") + 1]!)
  : path.join(root, "data", "fama-laws.db")

// Statute categories only — 案例/脚本/模板 are not statutes. DLC holds the
// provincial local regulations in per-province subdirectories.
const CATEGORIES: Array<{ dir: string; label: string }> = [
  { dir: "宪法", label: "宪法" },
  { dir: "宪法相关法", label: "宪法相关法" },
  { dir: "刑法", label: "刑法" },
  { dir: "民法典", label: "民法典" },
  { dir: "民法商法", label: "民法商法" },
  { dir: "经济法", label: "经济法" },
  { dir: "行政法", label: "行政法" },
  { dir: "行政法规", label: "行政法规" },
  { dir: "社会法", label: "社会法" },
  { dir: "诉讼与非诉讼程序法", label: "诉讼与非诉讼程序法" },
  { dir: "司法解释", label: "司法解释" },
  { dir: "部门规章", label: "部门规章" },
  { dir: "其他", label: "其他" },
  { dir: "DLC", label: "地方性法规" },
]

// All SQL is constant text; every runtime value goes through bound parameters.
const PRAGMA_OFF = "PRAGMA journal_mode = OFF"
const PRAGMA_SYNC = "PRAGMA synchronous = OFF"
const SCHEMA_LAWS = "CREATE TABLE laws (id INTEGER PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL, file TEXT NOT NULL, meta TEXT NOT NULL DEFAULT '')"
const SCHEMA_ARTICLES =
  "CREATE TABLE articles (id INTEGER PRIMARY KEY, law_id INTEGER NOT NULL REFERENCES laws(id), law_title TEXT NOT NULL, num TEXT NOT NULL, num_ord INTEGER NOT NULL, chapter TEXT NOT NULL DEFAULT '', content TEXT NOT NULL)"
const SCHEMA_IDX_LAW = "CREATE INDEX idx_articles_law ON articles(law_id, num_ord)"
const SCHEMA_IDX_TITLE = "CREATE INDEX idx_laws_title ON laws(title)"
const SCHEMA_FTS_LAWS =
  "CREATE VIRTUAL TABLE laws_fts USING fts5(title, content='laws', content_rowid='id', tokenize='trigram')"
const SCHEMA_FTS_ARTICLES =
  "CREATE VIRTUAL TABLE articles_fts USING fts5(law_title, num, content, content='articles', content_rowid='id', tokenize='trigram')"
const SQL_BEGIN = "BEGIN"
const SQL_COMMIT = "COMMIT"
const SQL_INSERT_LAW = "INSERT INTO laws (title, category, file, meta) VALUES (?1, ?2, ?3, ?4)"
const SQL_INSERT_ARTICLE =
  "INSERT INTO articles (law_id, law_title, num, num_ord, chapter, content) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
const SQL_INSERT_LAW_FTS = "INSERT INTO laws_fts (rowid, title) VALUES (?1, ?2)"
const SQL_INSERT_ARTICLE_FTS = "INSERT INTO articles_fts (rowid, law_title, num, content) VALUES (?1, ?2, ?3, ?4)"
const SQL_SMOKE =
  "SELECT law_title, num, snippet(articles_fts, 2, '【', '】', '…', 8) AS s FROM articles_fts WHERE articles_fts MATCH ?1 LIMIT 3"

type ParsedArticle = { num: string; numOrd: number; chapter: string; content: string }
type ParsedLaw = { title: string; category: string; file: string; meta: string; articles: ParsedArticle[] }

const ARTICLE_START = /^第([零〇一二三四五六七八九十百千万两0-9]+)条(之一|之二|之三|之四|之五)?/
const CHAPTER_START = /^#{1,3}\s*(第[零〇一二三四五六七八九十百千万两0-9]+[章节编][^\n]*)/

export function parseLaw(markdown: string, category: string, file: string): ParsedLaw {
  const lines = markdown.split("\n")
  const titleLine = lines.find((line) => line.startsWith("# "))
  const title = (titleLine?.replace(/^#\s*/, "") ?? file).trim()
  const infoEnd = lines.indexOf("<!-- INFO END -->")
  const meta = lines
    .slice(1, infoEnd === -1 ? Math.min(lines.length, 12) : infoEnd)
    .filter((line) => line.trim() && !line.startsWith("#"))
    .join("\n")
    .trim()

  const bodyStart = infoEnd === -1 ? 0 : infoEnd + 1
  const articles: ParsedArticle[] = []
  let chapter = ""
  let current: { num: string; numOrd: number; lines: string[] } | undefined

  const flush = () => {
    if (!current) return
    const content = current.lines.join("\n").trim()
    if (content) articles.push({ num: current.num, numOrd: current.numOrd, chapter, content })
    current = undefined
  }

  for (const line of lines.slice(bodyStart)) {
    const chapterMatch = line.match(CHAPTER_START)
    if (chapterMatch) {
      flush()
      chapter = chapterMatch[1]!.trim()
      continue
    }
    const articleMatch = line.match(ARTICLE_START)
    if (articleMatch) {
      flush()
      const ord = cnNumberToInt(articleMatch[1]!)
      // articleMatch[0] is the full "第X条[之一]" heading token
      current = { num: articleMatch[0], numOrd: ord ?? 0, lines: [line] }
      continue
    }
    if (current) current.lines.push(line)
  }
  flush()

  return { title, category, file, meta, articles }
}

async function main() {
  await rm(out, { force: true })
  await mkdir(path.dirname(out), { recursive: true })
  const db = new Database(out)
  db.run(PRAGMA_OFF)
  db.run(PRAGMA_SYNC)
  db.run(SCHEMA_LAWS)
  db.run(SCHEMA_ARTICLES)
  db.run(SCHEMA_IDX_LAW)
  db.run(SCHEMA_IDX_TITLE)
  db.run(SCHEMA_FTS_LAWS)
  db.run(SCHEMA_FTS_ARTICLES)

  const insertLaw = db.prepare(SQL_INSERT_LAW)
  const insertArticle = db.prepare(SQL_INSERT_ARTICLE)
  const insertLawFts = db.prepare(SQL_INSERT_LAW_FTS)
  const insertArticleFts = db.prepare(SQL_INSERT_ARTICLE_FTS)
  const smoke = db.prepare(SQL_SMOKE)

  let lawCount = 0
  let articleCount = 0
  const t0 = Date.now()

  db.run(SQL_BEGIN)
  for (const { dir: dirName, label } of CATEGORIES) {
    const dir = path.join(root, "data", "laws", dirName)
    let names: string[]
    try {
      names = await readdir(dir, { recursive: true })
    } catch {
      continue
    }
    for (const rel of names) {
      if (!rel.endsWith(".md")) continue
      if (path.basename(rel).startsWith("_")) continue
      const file = path.join(dirName, rel)
      const markdown = await Bun.file(path.join(dir, rel)).text()
      const law = parseLaw(markdown, label, file)
      if (!law.title) continue
      const lawId = Number(insertLaw.run(law.title, law.category, law.file, law.meta).lastInsertRowid)
      insertLawFts.run(lawId, law.title)
      for (const article of law.articles) {
        const articleId = Number(
          insertArticle
            .run(lawId, law.title, article.num, article.numOrd, article.chapter, article.content)
            .lastInsertRowid,
        )
        insertArticleFts.run(articleId, law.title, article.num, article.content)
        articleCount++
      }
      lawCount++
    }
  }
  db.run(SQL_COMMIT)

  const size = ((await Bun.file(out).size) / 1024 / 1024).toFixed(1)
  console.log(
    `indexed ${lawCount} statutes, ${articleCount} articles -> ${path.relative(root, out)} (${size} MB, ${Date.now() - t0}ms)`,
  )

  const hits = smoke.all(ftsEscape("数据出境")) as { law_title: string; num: string }[]
  console.log("smoke '数据出境':", hits.length, "hits; first:", hits[0] ? `${hits[0].law_title} ${hits[0].num}` : "-")
  db.close()
}

if (import.meta.main) await main()
