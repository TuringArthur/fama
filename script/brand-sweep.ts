#!/usr/bin/env bun
/**
 * One-off brand sweep for locale files and theme JSONs.
 * Replaces stale opencode identifiers with fama equivalents while
 * preserving real service URLs (opencode.ai/zen etc.) via placeholders.
 *
 * Usage: bun script/brand-sweep.ts
 */

import { readdir, readFile, writeFile } from "fs/promises"
import path from "path"

const root = path.resolve(import.meta.dir, "..")

const TARGET_DIRS = [
  "packages/app/src/i18n",
  "packages/desktop/src/renderer/i18n",
  "packages/ui/src/theme/themes",
  "packages/tui/src/theme/assets",
]
const TARGET_FILES = ["packages/ui/src/theme/desktop-theme.schema.json"]

const PROTECT = /https:\/\/opencode\.ai[^\s"'`,)]*/g

const SUBS: [RegExp, string][] = [
  [/@opencode-ai\//g, "@fama-ai/"],
  [/opencode\.jsonc/g, "fama.jsonc"],
  [/opencode\.json/g, "fama.json"],
  [/~\/\.config\/opencode/g, "~/.config/fama"],
  [/\.opencode\//g, ".fama/"],
  [/opencode-ai/g, "fama"],
  [/OpenCode/g, "Fama"],
  [/OPENCODE/g, "FAMA"],
  [/\bopencode\b/g, "fama"],
]

// Every path this script touches must resolve inside the repo root.
function insideRoot(rel: string): string {
  const resolved = path.resolve(root, rel)
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`refusing to touch path outside repo root: ${rel}`)
  }
  return resolved
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

let changedFiles = 0

function sweep(content: string): string {
  const kept: string[] = []
  let after = content.replace(PROTECT, (match) => {
    kept.push(match)
    return `\u0000P${kept.length - 1}\u0000`
  })
  for (const [pattern, replacement] of SUBS) {
    after = after.replace(pattern, replacement)
  }
  return after.replace(/\u0000P(\d+)\u0000/g, (_, i) => kept[Number(i)])
}

function swapDomain(content: string): string {
  return content.replace(/https:\/\/fama\.ai\//g, "https://fama.stdlaw.cn/")
}

for (const rel of TARGET_DIRS) {
  const dir = insideRoot(rel)
  for (const file of await walk(dir)) {
    if (!/\.(ts|json)$/.test(file)) continue
    const before = await readFile(file, "utf8")
    const after = rel.endsWith("themes") || rel.includes("theme/assets") ? swapDomain(sweep(before)) : sweep(before)
    if (after !== before) {
      await writeFile(file, after)
      changedFiles++
    }
  }
}

for (const rel of TARGET_FILES) {
  const file = insideRoot(rel)
  const before = await readFile(file, "utf8")
  const after = swapDomain(before)
  if (after !== before) {
    await writeFile(file, after)
    changedFiles++
  }
}

console.log(`swept ${changedFiles} files`)
