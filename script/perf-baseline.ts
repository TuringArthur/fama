#!/usr/bin/env bun
/**
 * Performance baseline for the Fama web bundle.
 *
 * Builds packages/app with vite and records bundle composition (sizes by
 * category, largest chunks) into perf/results/<label>.json so form-line
 * changes (themes, fonts, branding) can be compared before/after.
 *
 * Usage:
 *   bun script/perf-baseline.ts --label pre-m1
 *   bun script/perf-baseline.ts --label post-fonts --compare pre-m1
 */

import { readdir, stat, mkdir, writeFile } from "fs/promises"
import path from "path"

const root = path.resolve(import.meta.dir, "..")
const appDir = path.join(root, "packages", "app")
const distDir = path.join(appDir, "dist")
const resultsDir = path.join(root, "perf", "results")

const { values } = (() => {
  const args = Bun.argv.slice(2)
  const out: Record<string, string> = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--label") out.label = args[++i]
    else if (args[i] === "--compare") out.compare = args[++i]
  }
  return { values: out }
})()

const label = values.label ?? new Date().toISOString().replace(/[:.]/g, "-")

function category(file: string): string {
  const ext = path.extname(file).toLowerCase()
  if (ext === ".js" || ext === ".mjs") return "js"
  if (ext === ".css") return "css"
  if ([".woff", ".woff2", ".ttf", ".otf"].includes(ext)) return "font"
  if ([".png", ".jpg", ".jpeg", ".svg", ".webp", ".ico"].includes(ext)) return "image"
  if ([".html", ".json", ".webmanifest", ".map"].includes(ext)) return "other"
  return "other"
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await walk(full)))
    else out.push(full)
  }
  return out
}

function fmt(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`
  return `${(bytes / 1024).toFixed(1)} KB`
}

console.log(`Building packages/app (vite build)...`)
const buildStart = Date.now()
const proc = Bun.spawn(["bun", "run", "build"], {
  cwd: appDir,
  stdout: "pipe",
  stderr: "pipe",
})
const [buildOut, buildErr] = await Promise.all([
  new Response(proc.stdout).text(),
  new Response(proc.stderr).text(),
])
const buildCode = await proc.exited
if (buildCode !== 0) {
  console.error(buildOut)
  console.error(buildErr)
  process.exit(buildCode)
}
const buildMs = Date.now() - buildStart

const files = await walk(distDir)
const byCategory: Record<string, { count: number; bytes: number }> = {}
let total = 0
const all: { file: string; bytes: number }[] = []
for (const file of files) {
  const { size } = await stat(file)
  const cat = category(file)
  byCategory[cat] ??= { count: 0, bytes: 0 }
  byCategory[cat].count++
  byCategory[cat].bytes += size
  total += size
  all.push({ file: path.relative(distDir, file), bytes: size })
}
all.sort((a, b) => b.bytes - a.bytes)

const result = {
  label,
  gitRev: (await Bun.$`git rev-parse --short HEAD`.quiet().text()).trim(),
  bun: Bun.version,
  timestamp: new Date().toISOString(),
  buildMs,
  totalBytes: total,
  categories: byCategory,
  top10: all.slice(0, 10),
}

await mkdir(resultsDir, { recursive: true })
const outPath = path.join(resultsDir, `${label}.json`)
await writeFile(outPath, JSON.stringify(result, null, 2) + "\n")

console.log(`\n=== bundle: ${fmt(total)} | build: ${(buildMs / 1000).toFixed(1)}s | rev ${result.gitRev} ===`)
for (const [cat, v] of Object.entries(byCategory)) {
  console.log(`  ${cat.padEnd(6)} ${String(v.count).padStart(4)} files  ${fmt(v.bytes)}`)
}
console.log(`\nTop files:`)
for (const f of result.top10) console.log(`  ${fmt(f.bytes).padStart(10)}  ${f.file}`)
console.log(`\nSaved: ${path.relative(root, outPath)}`)

if (values.compare) {
  const comparePath = path.join(resultsDir, `${values.compare}.json`)
  const prev = await Bun.file(comparePath).json()
  console.log(`\n=== compare vs "${prev.label}" (${prev.gitRev}) ===`)
  console.log(`  total:  ${fmt(prev.totalBytes)} -> ${fmt(total)}  (${total - prev.totalBytes >= 0 ? "+" : ""}${fmt(total - prev.totalBytes)})`)
  console.log(`  build:  ${(prev.buildMs / 1000).toFixed(1)}s -> ${(buildMs / 1000).toFixed(1)}s`)
  for (const cat of new Set([...Object.keys(prev.categories), ...Object.keys(byCategory)])) {
    const before = prev.categories[cat]?.bytes ?? 0
    const after = byCategory[cat]?.bytes ?? 0
    if (before !== after) {
      console.log(`  ${cat.padEnd(6)} ${fmt(before)} -> ${fmt(after)}  (${after - before >= 0 ? "+" : ""}${fmt(after - before)})`)
    }
  }
}
