#!/usr/bin/env bun
/** Precise UTF-8 validator: reports invalid byte offsets + hex context. */
const files = process.argv.slice(2)
const names = ["ASCII", "cont", "lead2", "lead3", "lead4", "too-big", "too-small"]

function validate(buf: Uint8Array) {
  const bad: { offset: number; hex: string; reason: string }[] = []
  let i = 0
  const hex = (s: number, e: number) =>
    Array.from(buf.slice(s, e))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ")
  while (i < buf.length) {
    const b = buf[i]!
    let len = 0
    if (b < 0x80) len = 1
    else if (b >= 0xc2 && b <= 0xdf) len = 2
    else if (b >= 0xe0 && b <= 0xef) len = 3
    else if (b >= 0xf0 && b <= 0xf4) len = 4
    else {
      bad.push({ offset: i, hex: hex(i, Math.min(i + 8, buf.length)), reason: `invalid lead byte 0x${b.toString(16)}` })
      i++
      continue
    }
    let ok = true
    for (let k = 1; k < len; k++) {
      const c = buf[i + k]
      if (c === undefined || c < 0x80 || c > 0xbf) {
        bad.push({
          offset: i,
          hex: hex(i, Math.min(i + len + 4, buf.length)),
          reason: `truncated/invalid continuation at +${k} (got ${c === undefined ? "EOF" : "0x" + c.toString(16)})`,
        })
        ok = false
        break
      }
    }
    if (ok) i += len
    else i += len // skip the intended length regardless
    if (bad.length > 20) break
  }
  return bad
}

for (const f of files) {
  const buf = await Bun.file(f).bytes()
  const bad = validate(buf)
  console.log(`\n=== ${f} (${buf.length} bytes, ${bad.length}${bad.length > 20 ? "+" : ""} issues) ===`)
  for (const b of bad.slice(0, 8)) console.log(`  @${b.offset}: ${b.reason} | ctx: ${b.hex}`)
}
