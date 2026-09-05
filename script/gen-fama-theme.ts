#!/usr/bin/env bun
/**
 * One-off: re-skin the two default themes (ui oc-2, tui opencode) with the
 * Fama navy legal palette. Theme ids stay "oc-2"/"opencode" so every
 * default-theme special case (FOUC preload, cache, fallbacks) keeps working.
 *
 * Usage: bun script/gen-fama-theme.ts
 */

import path from "path"

const root = path.resolve(import.meta.dir, "..")

// hex (#rgb|#rrggbb) -> hsl -> hex
function hexToHsl(hex: string): [number, number, number] {
  let h = hex.replace("#", "")
  if (h.length === 3) h = h.split("").map((c) => c + c).join("")
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l * 100]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let hue = 0
  if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) hue = ((b - r) / d + 2) / 6
  else hue = ((r - g) / d + 4) / 6
  return [hue * 360, s * 100, l * 100]
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100
  l /= 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  const to = (x: number) =>
    Math.round(255 * x)
      .toString(16)
      .padStart(2, "0")
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`
}

/** Re-tint a hex color to the navy hue while keeping its lightness. */
function navy(hex: string, sat = 18, hue = 215): string {
  const [, , l] = hexToHsl(hex)
  return hslToHex(hue, sat, l)
}

const uiPath = path.join(root, "packages/ui/src/theme/themes/oc-2.json")
const ui = (await Bun.file(uiPath).json()) as {
  name: string
  light: { palette: Record<string, string>; overrides?: Record<string, string>; v2Overrides?: Record<string, string> }
  dark: { palette: Record<string, string>; overrides?: Record<string, string>; v2Overrides?: Record<string, string> }
}

ui.name = "Fama Legal"

// --- light palette: cool paper + navy ink ---
Object.assign(ui.light.palette, {
  neutral: "#f2f5f9",
  ink: "#101c33",
  primary: "#1e3a5f",
  success: "#1f8a4c",
  warning: "#b07d2a",
  error: "#c73e44",
  info: "#2b7a8a",
  interactive: "#1f4f8f",
})
// --- dark palette: deep navy ---
Object.assign(ui.dark.palette, {
  neutral: "#0d1523",
  ink: "#e6ecf5",
  primary: "#7fa8e0",
  success: "#7fd88f",
  warning: "#e5c07b",
  error: "#e06c75",
  info: "#56b6c2",
  interactive: "#5b8dd9",
})

// --- overrides: only re-tint keys that already exist ---
const lightOverrides: Record<string, string> = {
  "text-strong": "#14213d",
  "text-base": "#44506b",
  "text-weak": "#5d6b85",
  "text-weaker": "#8b98ad",
  "border-weak-base": "#d5dde8",
  "border-weaker-base": "#e4eaf2",
  "surface-raised-base": "#f7f9fc",
  "surface-raised-base-hover": "#eef2f7",
  "surface-base": "#fbfcfe",
  "syntax-keyword": "#1f4f8f",
  "syntax-primitive": "#1e3a5f",
}
const darkOverrides: Record<string, string> = {
  "text-strong": "#e6ecf5",
  "text-base": "#b9c6d9",
  "text-weak": "#93a3bb",
  "text-weaker": "#5f7191",
  "border-weak-base": "#24324a",
  "border-weaker-base": "#1c2940",
  "surface-raised-base": "#121d31",
  "surface-base": "#0f1828",
  "surface-raised-base-hover": "#16233a",
}
for (const [mode, patch] of [
  ["light", lightOverrides],
  ["dark", darkOverrides],
] as const) {
  const target = ui[mode].overrides
  if (!target) continue
  for (const [key, value] of Object.entries(patch)) {
    if (key in target) target[key] = value
  }
}

// --- v2 scale: tint greys and blues toward navy, keep lightness steps ---
const v2 = ui.light.v2Overrides
const v2Dark = ui.dark.v2Overrides
function tintScale(map: Record<string, string> | undefined, prefix: string, sat: number, hue: number) {
  if (!map) return
  for (const key of Object.keys(map)) {
    if (!key.startsWith(prefix)) continue
    const value = map[key]!
    if (!value.startsWith("#")) continue
    map[key] = navy(value.slice(0, 7), sat, hue) + "ff"
  }
}
// grey scale drives every background: subtle cool tint, not a color wash
tintScale(v2, "v2-grey-", 14, 216)
tintScale(v2Dark, "v2-grey-", 14, 216)
// accent blue becomes navy
tintScale(v2, "v2-blue-", 52, 216)
tintScale(v2Dark, "v2-blue-", 52, 216)

await Bun.write(uiPath, JSON.stringify(ui, null, 2) + "\n")

// --- TUI theme: swap the defs to the navy legal palette ---
const tuiPath = path.join(root, "packages/tui/src/theme/assets/opencode.json")
const tui = (await Bun.file(tuiPath).json()) as { defs: Record<string, string>; theme: unknown }

Object.assign(tui.defs, {
  darkStep1: "#0a0f1a",
  darkStep2: "#0f1626",
  darkStep3: "#141e33",
  darkStep4: "#1a2740",
  darkStep5: "#22314e",
  darkStep6: "#2c3d5c",
  darkStep7: "#3a4d6e",
  darkStep8: "#55688a",
  darkStep9: "#7fa8e0",
  darkStep10: "#a3c2ee",
  darkStep11: "#7d8aa3",
  darkStep12: "#e6ecf5",
  darkSecondary: "#d4b06a",
  darkAccent: "#9d8cd8",
  lightStep1: "#ffffff",
  lightStep2: "#fafbfd",
  lightStep3: "#f2f5f9",
  lightStep4: "#e8edf3",
  lightStep5: "#dde4ed",
  lightStep6: "#cdd7e3",
  lightStep7: "#a9b8cb",
  lightStep8: "#8494ab",
  lightStep9: "#1e3a5f",
  lightStep10: "#16304f",
  lightStep11: "#7c8aa0",
  lightStep12: "#1a2438",
  lightSecondary: "#8a6d2f",
  lightAccent: "#b07d2a",
})

await Bun.write(tuiPath, JSON.stringify(tui, null, 2) + "\n")

console.log("re-skinned oc-2 (Fama Legal) and tui opencode theme")
