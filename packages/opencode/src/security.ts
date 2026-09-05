// 法码安全工程：离线模式开关与出站 URL 防护（SSRF）。
// 出站请求约定（与仓库安全钩子一致）：仅允许 http/https；发请求前校验 host，
// 拒绝 localhost、环回、私有与保留地址。
import { Flag } from "@fama-ai/core/flag/flag"

// 进程内开关：ToolRegistry 初始化时从 config.privacy 注入；FAMA_OFFLINE 环境变量可独立强制。
let offlineFromConfig = false

export function setOfflineFromConfig(privacy: { offline?: boolean } | undefined) {
  offlineFromConfig = privacy?.offline === true
}

export function isOffline() {
  return offlineFromConfig || Flag.FAMA_OFFLINE
}

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "localdomain",
  "broadcasthost",
  "ip6-localhost",
  "ip6-loopback",
])

function ipv4ToInt(host: string): number | undefined {
  const parts = host.split(".")
  if (parts.length !== 4) return undefined
  let value = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return undefined
    const octet = Number(part)
    if (octet > 255) return undefined
    value = value * 256 + octet
  }
  return value
}

// IPv4 私有/保留段（含 0/8、环回、链路本地、组播与保留末段）。
const BLOCKED_IPV4_RANGES: Array<readonly [number, number]> = [
  [0x00000000, 0x00ffffff], // 0.0.0.0/8
  [0x0a000000, 0x0affffff], // 10.0.0.0/8
  [0x64400000, 0x647fffff], // 100.64.0.0/10
  [0x7f000000, 0x7fffffff], // 127.0.0.0/8
  [0xa9fe0000, 0xa9feffff], // 169.254.0.0/16
  [0xac100000, 0xac1fffff], // 172.16.0.0/12
  [0xc0000000, 0xc00000ff], // 192.0.0.0/24
  [0xc0000200, 0xc00002ff], // 192.0.2.0/24
  [0xc0586300, 0xc05863ff], // 192.88.99.0/24
  [0xc0a80000, 0xc0a8ffff], // 192.168.0.0/16
  [0xc6120000, 0xc613ffff], // 198.18.0.0/15
  [0xc6336400, 0xc63364ff], // 198.51.100.0/24
  [0xcb007100, 0xcb0071ff], // 203.0.113.0/24
  [0xe0000000, 0xefffffff], // 224.0.0.0/4（组播）
  [0xf0000000, 0xffffffff], // 240.0.0.0/4（保留/广播）
]

function isBlockedIPv4(value: number) {
  return BLOCKED_IPV4_RANGES.some(([lo, hi]) => value >= lo && value <= hi)
}

function expandIPv6(raw: string): number[] | undefined {
  let value = raw.toLowerCase()
  if (value.startsWith("[") && value.endsWith("]")) value = value.slice(1, -1)
  const zone = value.indexOf("%")
  if (zone >= 0) value = value.slice(0, zone)
  const halves = value.split("::")
  if (halves.length > 2) return undefined
  const parseGroups = (segment: string): number[] | undefined => {
    if (segment === "") return []
    const out: number[] = []
    for (const part of segment.split(":")) {
      if (part.includes(".")) {
        const v4 = ipv4ToInt(part)
        if (v4 === undefined) return undefined
        out.push(v4 >>> 16, v4 & 0xffff)
        continue
      }
      if (!/^[0-9a-f]{1,4}$/.test(part)) return undefined
      out.push(parseInt(part, 16))
    }
    return out
  }
  const head = parseGroups(halves[0] ?? "")
  if (!head) return undefined
  const tail = halves.length === 2 ? parseGroups(halves[1] ?? "") : []
  if (!tail) return undefined
  const missing = 8 - head.length - tail.length
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return undefined
  return [...head, ...new Array(missing).fill(0), ...tail]
}

function isBlockedIPv6(hextets: number[]) {
  if (hextets.every((h) => h === 0)) return true // :: 未指定地址
  if (hextets.slice(0, 7).every((h) => h === 0) && hextets[7] === 1) return true // ::1 环回
  if (hextets[0] === 0x64 && hextets[1] === 0xff9b) return true // NAT64 64:ff9b::/96
  if (
    hextets[0] === 0 &&
    hextets[1] === 0 &&
    hextets[2] === 0 &&
    hextets[3] === 0 &&
    hextets[4] === 0 &&
    hextets[5] === 0xffff
  ) {
    // 注意：JS 位运算是 32 位有符号，<< 会把高位地址变成负数，必须 >>> 0 转回无符号
    const v4 = ((hextets[6] << 16) | hextets[7]) >>> 0
    return isBlockedIPv4(v4)
  }
  const first = hextets[0]
  return (first >= 0xfc00 && first <= 0xfdff) || (first >= 0xfe80 && first <= 0xfebf) // ULA / 链路本地
}

// 发请求前校验出站 URL；不合规直接抛错。
// 已知边界：这里做的是静态校验（协议/内嵌凭据/主机名与 IP 字面量），
// 域名经 DNS 解析后落在私网的场景由部署环境兜底，见 docs/security.md。
export function assertSafeUrl(rawUrl: string): void {
  let url: URL
  try {
    url = new URL(rawUrl.trim())
  } catch {
    throw new Error(`URL 无法解析：${rawUrl.slice(0, 200)}`)
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`URL 协议仅允许 http/https，收到：${url.protocol}`)
  }
  if (url.username || url.password) {
    throw new Error("URL 不允许内嵌用户名/密码")
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "")
  if (!host) throw new Error("URL 缺少主机名")
  if (BLOCKED_HOSTS.has(host) || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error(`拒绝访问本地主机：${host}`)
  }
  const v4 = ipv4ToInt(host)
  if (v4 !== undefined) {
    if (isBlockedIPv4(v4)) throw new Error(`拒绝访问私有/保留地址：${host}`)
    return
  }
  if (host.includes(":")) {
    const hextets = expandIPv6(host)
    if (hextets && isBlockedIPv6(hextets)) throw new Error(`拒绝访问私有/保留地址：${host}`)
  }
}
