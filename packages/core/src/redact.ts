// 案件脱密（脱敏）引擎 —— 纯函数，无 IO、无 Effect、不依赖 node 内置模块。
// 目标：让律师、法官、检察官在不泄露当事人信息、国家秘密、商业秘密、个人隐私的前提下，
// 把案件材料生成一套「脱密副本」，可安全上传到 AI 平台协同处理。
//
// 这里只放「可验证核心」（detect / redact / buildMapping / summarize），供：
//   - opencode 的 `redact` 工具与 `fama redact` CLI（文件 IO + Effect 包装在外层）
//   - 桌面端/App 的脱密对话框（浏览器/渲染进程内直接调用，配合原生文件选择器）
// 共享同一份实现。

// 三类涉敏范围，对应《保守国家秘密法》《个人信息保护法》《反不正当竞争法（商业秘密）》的关切。
export type SensitivityScope = "nationalSecret" | "commercialSecret" | "personalPrivacy"

// 单条敏感信息的类别。scope 标注其归属的涉敏范围（用于「涉敏感信息即提示」的判定）。
export type Category =
  | "idCard" // 身份证号（个人隐私）
  | "phone" // 手机号（个人隐私）
  | "landline" // 固定电话（个人隐私）
  | "bankCard" // 银行卡号（个人隐私/财产）
  | "email" // 电子邮箱（个人隐私）
  | "licensePlate" // 车牌号（个人隐私）
  | "address" // 住址/地址（个人隐私）
  | "name" // 姓名（个人隐私）
  | "enterprise" // 企业/机构名称（商业秘密，视场景）
  | "secretMark" // 涉密/密级标记（国家秘密/商业秘密）
  | "custom" // 用户自定义规则命中的内容（范围视场景，默认按个人隐私处理）

export const CATEGORY_LABELS: Record<Category, string> = {
  idCard: "身份证号",
  phone: "手机号",
  landline: "固定电话",
  bankCard: "银行卡号",
  email: "邮箱",
  licensePlate: "车牌号",
  address: "地址",
  name: "姓名",
  enterprise: "企业名称",
  secretMark: "涉密标记",
  custom: "自定义",
}

// 每个类别归属的涉敏范围；用于汇总「本文档是否涉国家秘密/商业秘密/个人隐私」。
export const CATEGORY_SCOPE: Record<Category, SensitivityScope> = {
  idCard: "personalPrivacy",
  phone: "personalPrivacy",
  landline: "personalPrivacy",
  bankCard: "personalPrivacy",
  email: "personalPrivacy",
  licensePlate: "personalPrivacy",
  address: "personalPrivacy",
  name: "personalPrivacy",
  enterprise: "commercialSecret",
  secretMark: "nationalSecret",
  custom: "personalPrivacy",
}

export type Finding = {
  category: Category
  scope: SensitivityScope
  value: string
  start: number
  end: number
  // 自定义规则命中时携带规则名称，用于生成 `[名称N]` 形式的占位符；内置类别为空。
  label?: string
}

// 用户自定义脱密规则：把正则匹配到的内容替换为 `[名称N]` 占位符。
// pattern 为正则源字符串（如 "百达翡丽|XX科技有限公司"）；flags 缺省 "gi"。
export type CustomRule = {
  name: string
  pattern: string
  flags?: string
}

export type RedactionOptions = {
  // 仅脱敏指定内置类别；缺省为全部内置类别。自定义规则不受此过滤影响（用户显式定义即生效）。
  categories?: Category[]
  // 案号属公开信息，默认不脱敏（保持文档可检索性）。
  keepCaseNumbers?: boolean
  // 用户自定义规则：补充内置规则覆盖不到的实体（如特定公司、项目代号）。
  customRules?: CustomRule[]
}

export type MappingEntry = {
  token: string
  category: Category
  value: string
  // 自定义规则的名称（用于在对照表中还原占位符标签）；内置类别为空。
  label?: string
}

export type RedactionStats = Partial<Record<Category, number>>

export type ScopeHits = Record<SensitivityScope, boolean>

export function emptyScopeHits(): ScopeHits {
  return { nationalSecret: false, commercialSecret: false, personalPrivacy: false }
}

export type RedactionResult = {
  redacted: string
  findings: Finding[]
  mapping: MappingEntry[]
  stats: RedactionStats
  scopeHits: ScopeHits
}

// ---- 检测器 ----
// 高价值类别用精确正则；姓名/地址/企业名称为启发式（受上下文约束以降低误报）。

const ID_CARD_RE = /(?<!\d)([1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx])(?!\d)/gd
const PHONE_RE = /(?<!\d)(1[3-9]\d{9})(?!\d)/gd
const LANDLINE_RE = /(?<!\d)(0\d{2,3}-?\d{7,8})(?!\d)/gd
// 银行卡：16~19 位连续数字，或 4 位一组以空格/短横分隔；身份证（18 位含日期结构）已被上面优先吃掉。
const BANK_CARD_RE = /(?<!\d)(?:(?:\d{4}[-\s]?){3}\d{1,4}|\d{16,19})(?!\d)/gd
const EMAIL_RE = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gd
const LICENSE_PLATE_RE =
  /([京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤川青藏琼宁][A-HJ-NP-Z](?:[A-HJ-NP-Z0-9]{4,5}[A-HJ-NP-Z0-9]|[0-9]{4,5}))/gd
// 详细地址：直辖市或「XX省/自治区」开头 + 区/县 + 街道门牌后缀。冒号/标点会截断，避免吞掉前置标签。
const ADDRESS_RE =
  /((?:北京|天津|上海|重庆|[^\s，。；:;,：]{2,5}(?:省|自治区))[^\s，。；:;,：]{0,20}(?:路|街|道|巷|弄|号|村|组|幢|栋|单元|室|楼|小区|大厦|花园|广场|大道|号院)[\d号栋幢室]{0,8})/gd

// 涉密/密级标记词：命中即提示本文档涉密，需要谨慎处理。
const SECRET_MARK_RE = /(绝密|机密|秘密|涉密|国家秘密|国家机密|商业秘密|核心技术秘密|工作秘密|内部事项|不予公开)/gd

// 姓名抽取：依赖诉讼/合同角色称谓 + 显式分隔符（：:、，,空格），仅脱敏姓名本身（保留「原告」等称谓）。
// 用非贪婪量词 + 终结符前瞻：姓名结束于标点/空白/或常见动词（诉/称）之前，避免把「张三诉被告」误吞成「张三诉被」。
// 无分隔符的「原告张三」边界模糊、误报高，故不处理。
const NAME_ROLE =
  "原告|被告|上诉人|被上诉人|申请人|被申请人|再审申请人|申诉人|被申诉人|第三人|犯罪嫌疑人|被告人|嫌疑人|受害人|被害人|自诉人|反诉人|原告人|被告单位|当事人|法定代理人|委托代理人|委托诉讼代理人|辩护人|代理人|甲方|乙方|丙方|丁方|出租方|承租方|买方|卖方|供方|需方|委托方|受托方|发包方|承包方|发包人|承包人|债权人|债务人|保证人|抵押人|抵押权人|许可方|被许可方|法定代表人|负责人|经办人|联系人|户名|户主"
const NAME_CONTEXT_RE = new RegExp(
  `(?:${NAME_ROLE})(?:[（(][^）)]{0,12}[）)])?[\\s：:、，,]+([\\u4e00-\\u9fa5·]{2,4}?)(?=[，。、；;：:\\s（）()诉称]|$)`,
  "gd",
)

// 企业/机构名称。
const ENTERPRISE_RE = /([\u4e00-\u9fa5A-Za-z0-9（）()]{2,30}(?:有限公司|股份有限公司|有限责任公司|合伙企业|事务所|集团|研究院|研究所|医院|学校|大学|协会|基金会|合作企业|总公司|分公司|子公司|研究中心))/gd

// 自定义规则优先级最高：用户显式定义的实体若与内置规则命中重叠，优先采用自定义占位符。
const CATEGORY_PRIORITY: Category[] = [
  "custom",
  "secretMark",
  "idCard",
  "bankCard",
  "phone",
  "landline",
  "licensePlate",
  "email",
  "enterprise",
  "address",
  "name",
]

function scan(re: RegExp, text: string, category: Category, group = 0, label?: string): Finding[] {
  const out: Finding[] = []
  for (const m of text.matchAll(re)) {
    // 所有检测器都带 `d` 标志，用 indices 取捕获组的精确 span（姓名等只脱敏实体本身）。
    const span = m.indices?.[group]
    const value = m[group]
    if (!span || !value) continue
    out.push({ category, scope: CATEGORY_SCOPE[category], value, start: span[0], end: span[1], label })
  }
  return out
}

// 编译用户正则：补齐 global + hasIndices 标志（`g` + `d`），其余沿用用户给定（默认不区分大小写）。
function compileCustom(rule: CustomRule): RegExp | null {
  const base = rule.flags ?? "i"
  const flags = base.includes("g") ? base : base + "g"
  const withIndices = flags.includes("d") ? flags : flags + "d"
  try {
    return new RegExp(rule.pattern, withIndices)
  } catch {
    // 非法正则静默忽略，避免一条坏规则让整个脱密失败。
    return null
  }
}

function scanCustom(rules: CustomRule[] | undefined, text: string): Finding[] {
  if (!rules?.length) return []
  const out: Finding[] = []
  for (const rule of rules) {
    const re = compileCustom(rule)
    if (!re) continue
    out.push(...scan(re, text, "custom", 0, rule.name))
  }
  return out
}

// 扫描文本得到全部命中，按类别优先级解决重叠（高优先级先占位，后命中若与之重叠则丢弃）。
export function detect(text: string, options: { customRules?: CustomRule[] } = {}): Finding[] {
  const raw: Finding[] = [
    ...scanCustom(options.customRules, text),
    ...scan(SECRET_MARK_RE, text, "secretMark"),
    ...scan(ID_CARD_RE, text, "idCard"),
    ...scan(BANK_CARD_RE, text, "bankCard"),
    ...scan(PHONE_RE, text, "phone"),
    ...scan(LANDLINE_RE, text, "landline"),
    ...scan(LICENSE_PLATE_RE, text, "licensePlate"),
    ...scan(EMAIL_RE, text, "email"),
    ...scan(ENTERPRISE_RE, text, "enterprise"),
    ...scan(ADDRESS_RE, text, "address"),
    ...scan(NAME_CONTEXT_RE, text, "name", 1),
  ]
  // 按优先级排序：先按类别优先级，类别相同时按位置稳定。
  const rank = new Map<Category, number>(CATEGORY_PRIORITY.map((c, i) => [c, i]))
  raw.sort((a, b) => rank.get(a.category)! - rank.get(b.category)! || a.start - b.start)

  const kept: Finding[] = []
  for (const f of raw) {
    if (kept.some((k) => f.start < k.end && f.end > k.start)) continue
    kept.push(f)
  }
  kept.sort((a, b) => a.start - b.start || b.end - a.end)
  return kept
}

// 占位符的标签：自定义规则用规则名，内置类别用类别名。
function findingLabel(f: { category: Category; label?: string }): string {
  return f.label ?? CATEGORY_LABELS[f.category]
}

// 同一标签下、相同值 → 同一占位符（使 AI 仍能识别同一主体/同一信息）。
function findingKey(f: { category: Category; value: string; label?: string }): string {
  return `${findingLabel(f)}|${f.value}`
}

// 为每个「不同的敏感值」分配一个稳定占位符。
export function buildMapping(findings: Finding[]): MappingEntry[] {
  const tokenByValue = new Map<string, string>()
  const counter: Record<string, number> = {}
  const mapping: MappingEntry[] = []
  for (const f of findings) {
    const key = findingKey(f)
    if (tokenByValue.has(key)) continue
    const label = findingLabel(f)
    const n = (counter[label] ?? 0) + 1
    counter[label] = n
    const token = `[${label}${n}]`
    tokenByValue.set(key, token)
    mapping.push({ token, category: f.category, value: f.value, label: f.label })
  }
  return mapping
}

// 用一组既定的 findings 生成脱密结果（占位符 + 替换 + 统计 + 范围）。
// 暴露给 UI：让用户先审阅、删改 detect() 的结果，再以删改后的子集正式脱密。
export function applyFindings(text: string, findings: Finding[]): RedactionResult {
  const mapping = buildMapping(findings)
  const tokenByValue = new Map<string, string>()
  for (const m of mapping) tokenByValue.set(`${findingLabel(m)}|${m.value}`, m.token)

  // 从后向前替换，避免位置偏移。
  const ordered = [...findings].sort((a, b) => b.start - a.start)
  let redacted = text
  for (const f of ordered) {
    const token = tokenByValue.get(findingKey(f))
    if (!token) continue
    redacted = redacted.slice(0, f.start) + token + redacted.slice(f.end)
  }

  const stats: RedactionStats = {}
  for (const f of findings) stats[f.category] = (stats[f.category] ?? 0) + 1

  const scopeHits: ScopeHits = {
    nationalSecret: findings.some((f) => f.scope === "nationalSecret"),
    commercialSecret: findings.some((f) => f.scope === "commercialSecret"),
    personalPrivacy: findings.some((f) => f.scope === "personalPrivacy"),
  }

  return { redacted, findings, mapping, stats, scopeHits }
}

export function redact(text: string, options: RedactionOptions = {}): RedactionResult {
  const want = options.categories ? new Set(options.categories) : null
  const findings = detect(text, { customRules: options.customRules }).filter(
    (f) => f.category === "custom" || (want ? want.has(f.category) : true),
  )
  return applyFindings(text, findings)
}

// 一条「要被脱敏的值」：脱敏时把原文里所有出现的 value 替换为占位符。
// 这是审阅阶段用户可自由删/改/增的最小单元（由 detect 的结果去重得到）。
export type ValueEntry = {
  category: Category
  value: string
  // 自定义规则来源时携带规则名，用于占位符标签；内置类别为空。
  label?: string
}

// 把按位置命中的 findings 折叠成「去重的值清单」，便于在 UI 里逐行编辑。
export function distinctValues(findings: Finding[]): ValueEntry[] {
  const seen = new Set<string>()
  const out: ValueEntry[] = []
  for (const f of findings) {
    if (!f.value || seen.has(f.value)) continue
    seen.add(f.value)
    out.push({ category: f.category, value: f.value, label: f.label })
  }
  return out
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

// 用一份用户删改后的「值清单」生成脱密结果：原文里每个值的所有出现处都替换为占位符。
// 支持用户新增/修改/删除任意条目；同值只占一个占位符，按值长度降序替换以减少互相嵌套的误替换。
export function applyValues(text: string, entries: ValueEntry[]): RedactionResult {
  const tokenByValue = new Map<string, string>()
  const counter: Record<string, number> = {}
  const mapping: MappingEntry[] = []
  for (const e of entries) {
    if (!e.value || tokenByValue.has(e.value)) continue
    const label = e.label ?? CATEGORY_LABELS[e.category]
    const n = (counter[label] ?? 0) + 1
    counter[label] = n
    const token = `[${label}${n}]`
    tokenByValue.set(e.value, token)
    mapping.push({ token, category: e.category, value: e.value, label: e.label })
  }

  // 按值长度降序替换，避免短值先替换掉长值里的一部分。
  const ordered = [...tokenByValue.entries()].sort((a, b) => b[0].length - a[0].length)
  let redacted = text
  for (const [value, token] of ordered) redacted = redacted.split(value).join(token)

  // 统计：统计原文里每个值的出现次数（重算位置，供 findings/stats）。
  const findings: Finding[] = []
  const stats: RedactionStats = {}
  for (const e of entries) {
    if (!e.value) continue
    const re = new RegExp(escapeRegExp(e.value), "g")
    let count = 0
    for (const m of text.matchAll(re)) {
      const start = m.index ?? 0
      findings.push({
        category: e.category,
        scope: CATEGORY_SCOPE[e.category],
        value: e.value,
        start,
        end: start + e.value.length,
        label: e.label,
      })
      count++
    }
    if (count) stats[e.category] = (stats[e.category] ?? 0) + count
  }
  findings.sort((a, b) => a.start - b.start || b.end - a.end)

  const scopeHits: ScopeHits = {
    nationalSecret: findings.some((f) => f.scope === "nationalSecret"),
    commercialSecret: findings.some((f) => f.scope === "commercialSecret"),
    personalPrivacy: findings.some((f) => f.scope === "personalPrivacy"),
  }

  return { redacted, findings, mapping, stats, scopeHits }
}

// 统计展示：按类别汇总命中数，附带敏感范围提示（pure，便于复用与单测）。
export function summarize(result: RedactionResult): string {
  const lines: string[] = []
  const total = result.findings.length
  lines.push(`脱密完成：共发现 ${total} 处敏感信息，覆盖 ${result.mapping.length} 个不同主体/信息。`)

  const entries = (Object.entries(result.stats) as [Category, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
  if (entries.length) {
    lines.push("", "【命中类别】")
    for (const [cat, n] of entries) lines.push(`- ${CATEGORY_LABELS[cat]}：${n} 处`)
  }

  const scopes: string[] = []
  if (result.scopeHits.nationalSecret) scopes.push("国家秘密")
  if (result.scopeHits.commercialSecret) scopes.push("商业秘密")
  if (result.scopeHits.personalPrivacy) scopes.push("个人隐私")
  if (scopes.length) lines.push("", `本文档涉及：${scopes.join("、")}。请确认脱密范围后再上传到 AI 平台。`)

  if (result.mapping.length) {
    lines.push("", "【占位对照表】（仅本地保留，切勿随脱密副本一起上传）")
    for (const m of result.mapping.slice(0, 30)) {
      lines.push(`- ${m.token} ← ${maskPreview(m.value)}`)
    }
    if (result.mapping.length > 30) lines.push(`- ……另 ${result.mapping.length - 30} 项省略`)
  }

  lines.push("", "提示：脱密为启发式规则匹配，追求高召回而非零误报；正式发布前请人工复核脱密副本。")
  return lines.join("\n")
}

// 对照表里对原始值做最小遮罩，避免「对照表」本身又泄露信息。
function maskPreview(value: string): string {
  if (value.length <= 4) return value[0] + "***"
  if (value.length <= 8) return value.slice(0, 2) + "***" + value.slice(-1)
  return value.slice(0, 3) + "***" + value.slice(-2)
}

// 源文件名 → 脱密副本文件名：保持「同后缀」。
//   foo.txt/foo.md  -> foo.脱密.txt / foo.脱密.md（纯文本，直接落盘）
//   foo.docx/foo.doc -> foo.脱密.docx（Office 输出统一写为真实 .docx；旧 .doc 在浏览器内无法重建二进制，故落为 .docx）
//   foo（无后缀）    -> foo.脱密.txt
// 纯字符串实现（不依赖 node 的 path 模块），便于在浏览器/渲染进程内直接使用。
export function redactedCopyName(fileName: string): string {
  const slash = Math.max(fileName.lastIndexOf("/"), fileName.lastIndexOf("\\"))
  const leaf = slash >= 0 ? fileName.slice(slash + 1) : fileName
  const dot = leaf.lastIndexOf(".")
  if (dot <= 0) return `${leaf}.脱密.txt`
  const ext = leaf.slice(dot).toLowerCase()
  const base = leaf.slice(0, dot)
  if (ext === ".txt" || ext === ".md" || ext === ".markdown") return `${base}.脱密${ext}`
  // Office 文档：脱密后产物用真实 .docx 承载，保证可直接用 Word 打开。
  if (ext === ".docx" || ext === ".docm" || ext === ".doc") return `${base}.脱密.docx`
  return `${base}.脱密.md`
}

// 判断源文件是否为 Office 文档（脱密后需生成真实 .docx，而非写纯文本）。
export function isOfficeSource(fileName: string): boolean {
  const dot = fileName.lastIndexOf(".")
  if (dot < 0) return false
  const ext = fileName.slice(dot).toLowerCase()
  return ext === ".docx" || ext === ".docm" || ext === ".doc"
}

export const REDACT_CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[]

// 类别标签 → 枚举 的反向查表（导入对照表时把中文标签还原成 Category）。
const LABEL_TO_CATEGORY = new Map<string, Category>(
  (Object.keys(CATEGORY_LABELS) as Category[]).map((c) => [CATEGORY_LABELS[c], c]),
)

// 既接受英文枚举（JSON 里的 "name"），也接受中文标签（旧版 Markdown 表里的「姓名」）。
function asCategory(raw: unknown): Category | undefined {
  if (typeof raw !== "string" || !raw) return undefined
  if (Object.prototype.hasOwnProperty.call(CATEGORY_LABELS, raw)) return raw as Category
  return LABEL_TO_CATEGORY.get(raw)
}

// 解除脱密（还原）：applyValues 的逆运算——把脱密文本里的占位符按对照表换回真实值。
// 用 split/join 做字面替换（免正则转义）；占位符以 `]` 结尾，`[姓名1]` 与 `[姓名10]` 互不为子串，故无需特殊边界处理。
export function restore(text: string, mapping: MappingEntry[]): string {
  if (!mapping.length) return text
  const valueByToken = new Map<string, string>()
  for (const m of mapping) if (m.token && m.value) valueByToken.set(m.token, m.value)
  if (!valueByToken.size) return text
  // 按 token 长度降序替换：先换更长的占位符，避免前缀相同时相互干扰。
  const ordered = [...valueByToken.entries()].sort((a, b) => b[0].length - a[0].length)
  let out = text
  for (const [token, value] of ordered) out = out.split(token).join(value)
  return out
}

// 把已保存的对照表读回为 MappingEntry[]。优先按 JSON 解析（往返稳健）；
// 兼容早期版本写出的 Markdown 表格 `| 占位符 | 类别 | 原始值 |`。无法识别时返回 []。
export function parseMappingTable(input: string): MappingEntry[] {
  const trimmed = input?.trim()
  if (!trimmed) return []
  // 仅当形似 JSON 数组时才尝试解析，避免给普通 Markdown 文件喂进 JSON.parse。
  if (trimmed.startsWith("[")) {
    try {
      const data: unknown = JSON.parse(trimmed)
      if (Array.isArray(data)) {
        const out: MappingEntry[] = []
        for (const item of data) {
          if (typeof item !== "object" || item === null) continue
          const rec = item as Record<string, unknown>
          const token = typeof rec.token === "string" ? rec.token : undefined
          const value = typeof rec.value === "string" ? rec.value : undefined
          const category = asCategory(rec.category)
          if (!token || !value || !category) continue
          const label = typeof rec.label === "string" ? rec.label : undefined
          out.push(label ? { token, value, category, label } : { token, value, category })
        }
        if (out.length) return out
      }
    } catch {
      // 不是合法 JSON，落到 Markdown 解析。
    }
  }
  // 兼容旧版 Markdown 表格。
  const out: MappingEntry[] = []
  for (const line of trimmed.split(/\r?\n/)) {
    const row = line.trim()
    if (!row.startsWith("|") || !row.endsWith("|")) continue
    const cols = row.slice(1, -1).split("|").map((c) => c.trim())
    if (cols.length < 3) continue
    const token = cols[0]
    if (!token || token === "占位符" || token.includes("---")) continue
    const categoryLabel = cols[1]
    // 原始值列后续可能含 `|`（理论上），按剩余列重新拼回。
    const value = cols.slice(2).join("|").trim()
    if (!value) continue
    const category = asCategory(categoryLabel)
    if (category) out.push({ token, value, category })
    else out.push({ token, value, category: "custom", label: categoryLabel })
  }
  return out
}

// 源文件名 → 还原副本文件名（解除脱密后产物）。与 redactedCopyName 对称，用「.还原.」前缀：
//   foo.txt/foo.md  -> foo.还原.txt / foo.还原.md（纯文本，直接落盘）
//   foo.docx/foo.doc -> foo.还原.docx（Office 输出统一写为真实 .docx）
//   foo（无后缀）    -> foo.还原.txt
export function restoredCopyName(fileName: string): string {
  const slash = Math.max(fileName.lastIndexOf("/"), fileName.lastIndexOf("\\"))
  const leaf = slash >= 0 ? fileName.slice(slash + 1) : fileName
  const dot = leaf.lastIndexOf(".")
  if (dot <= 0) return `${leaf}.还原.txt`
  const ext = leaf.slice(dot).toLowerCase()
  const base = leaf.slice(0, dot)
  if (ext === ".txt" || ext === ".md" || ext === ".markdown") return `${base}.还原${ext}`
  if (ext === ".docx" || ext === ".docm" || ext === ".doc") return `${base}.还原.docx`
  return `${base}.还原.md`
}
