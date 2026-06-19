import { Button } from "@fama-ai/ui/button"
import { Dialog } from "@fama-ai/ui/dialog"
import { useDialog } from "@fama-ai/ui/context/dialog"
import { showToast } from "@/utils/toast"
import {
  type Category,
  type CustomRule,
  type RedactionResult,
  CATEGORY_LABELS,
  REDACT_CATEGORIES,
  redact,
  redactedCopyName,
} from "@fama-ai/core/redact"
import { extractOfficeText, isExtractError, type ExtractedText } from "@/utils/docx"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { createStore } from "solid-js/store"
import { createMemo, createSignal, For, Show, type JSX } from "solid-js"

// 内置可勾选类别（custom 由用户规则驱动，不作为开关）。
const TOGGLE_CATEGORIES = REDACT_CATEGORIES.filter((c) => c !== "custom")
const READABLE_EXT = [".txt", ".md", ".markdown", ".text"]
const OFFICE_EXT = [".docx", ".docm", ".doc"]
const PICKABLE_EXT = [...READABLE_EXT, ...OFFICE_EXT]

const COPY_HEADER = [
  `# 案件脱密副本`,
  ``,
  `> 本副本由 Fama 脱密工具生成，已去除敏感信息，可安全上传到 AI 平台协同处理。`,
  ``,
  `---`,
  ``,
].join("\n")

type UiRule = { name: string; pattern: string; flags: string }
type BatchItem = {
  name: string
  result: RedactionResult | null
  fidelity: ExtractedText["fidelity"]
  note?: string
  status: "pending" | "done" | "error"
  error?: string
  saved: boolean
}

function mappingBody(result: RedactionResult): string {
  return [
    `# 脱密占位对照表`,
    ``,
    `> ⚠️ 本表记录脱密前后的对应关系，属敏感信息，请妥善保管，切勿随脱密副本一起上传。`,
    ``,
    `| 占位符 | 类别 | 原始值 |`,
    `| --- | --- | --- |`,
    ...result.mapping.map((m) => `| ${m.token} | ${CATEGORY_LABELS[m.category]} | ${m.value} |`),
  ].join("\n")
}

function statsEntries(result: RedactionResult): Array<[Category, number]> {
  return (Object.entries(result.stats) as Array<[Category, number]>)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
}

async function readFileText(file: File): Promise<ExtractedText> {
  if (READABLE_EXT.some((ext) => file.name.toLowerCase().endsWith(ext))) {
    return { text: await file.text(), fidelity: "high" }
  }
  const res = await extractOfficeText(file)
  if (isExtractError(res)) throw new Error(res.reason)
  return res
}

function joinPath(dir: string, name: string): string {
  return dir.endsWith("/") || dir.endsWith("\\") ? `${dir}${name}` : `${dir}/${name}`
}

export function DialogRedact() {
  const dialog = useDialog()
  const language = useLanguage()
  const platform = usePlatform()
  const t = (key: string, params?: Record<string, string | number | boolean>) => language.t(key, params)

  const [mode, setMode] = createSignal<"single" | "batch">("single")

  // 共享脱密选项：类别开关 + 自定义规则。
  const [cats, setCats] = createSignal<Set<Category>>(new Set(TOGGLE_CATEGORIES))
  const [rules, setRules] = createStore<UiRule[]>([])

  // 单文件/文本
  const [sourceName, setSourceName] = createSignal<string>("")
  const [text, setText] = createSignal<string>("")
  const [fidelity, setFidelity] = createSignal<ExtractedText["fidelity"]>("high")
  const [extractNote, setExtractNote] = createSignal<string | undefined>(undefined)
  const [result, setResult] = createSignal<RedactionResult | null>(null)
  const [preview, setPreview] = createSignal<"original" | "redacted">("redacted")
  const [busy, setBusy] = createSignal(false)
  const [savedTo, setSavedTo] = createSignal<string | null>(null)

  // 批量
  const [items, setItems] = createStore<BatchItem[]>([])

  const canPickFile = createMemo(() => !!platform.openAttachmentPickerDialog)
  const canSaveFile = createMemo(() => !!platform.writeTextFile && !!platform.saveFilePickerDialog)
  const isDesktop = createMemo(() => platform.platform === "desktop")
  const options = () => ({
    categories: cats().size === TOGGLE_CATEGORIES.length ? undefined : [...cats()],
    customRules: rules
      .filter((r) => r.pattern.trim())
      .map((r): CustomRule => ({ name: r.name.trim() || "自定义", pattern: r.pattern, flags: r.flags.trim() || undefined })),
  })

  const hasText = createMemo(() => text().trim().length > 0)
  const stats = createMemo(() => (result() ? statsEntries(result()!) : []))
  const scopes = createMemo(() => {
    const hits = result()?.scopeHits
    if (!hits) return [] as Array<{ key: string; label: string }>
    const out: Array<{ key: string; label: string }> = []
    if (hits.nationalSecret) out.push({ key: "nationalSecret", label: t("redact.scope.nationalSecret") })
    if (hits.commercialSecret) out.push({ key: "commercialSecret", label: t("redact.scope.commercialSecret") })
    if (hits.personalPrivacy) out.push({ key: "personalPrivacy", label: t("redact.scope.personalPrivacy") })
    return out
  })

  const toggleCat = (cat: Category) =>
    setCats((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })

  const addRule = () => setRules(rules.length, { name: "", pattern: "", flags: "" })
  const removeRule = (i: number) => setRules((list) => list.filter((_, idx) => idx !== i))

  const loadSingleFile = async (file: File) => {
    try {
      const doc = await readFileText(file)
      setText(doc.text)
      setSourceName(file.name)
      setFidelity(doc.fidelity)
      setExtractNote(doc.note)
      setResult(null)
      setSavedTo(null)
    } catch (error) {
      showToast({ title: String(error) })
    }
  }

  const pickFile = async () => {
    if (!platform.openAttachmentPickerDialog) return
    setBusy(true)
    try {
      await platform.openAttachmentPickerDialog(
        { extensions: PICKABLE_EXT, title: t("redact.picker.open") },
        async (file) => loadSingleFile(file),
      )
    } finally {
      setBusy(false)
    }
  }

  const runRedact = () => {
    const input = text()
    if (!input.trim()) return
    setResult(redact(input, options()))
    setPreview("redacted")
    setSavedTo(null)
  }

  // openAttachmentPickerDialog 的回调里拿到的 File 是异步释放的，需要保留引用供批量脱密时再读取。
  const batchFiles = new Map<string, File>()
  const loadBatchFiles = (files: File[]) => {
    batchFiles.clear()
    for (const file of files) batchFiles.set(file.name, file)
    setItems(
      files.map((file) => ({ name: file.name, result: null, fidelity: "high", status: "pending", saved: false })),
    )
  }

  const collectBatchFiles = async () => {
    if (!platform.openAttachmentPickerDialog) return
    setBusy(true)
    try {
      const collected: File[] = []
      await platform.openAttachmentPickerDialog(
        { extensions: PICKABLE_EXT, multiple: true, title: t("redact.picker.openMultiple") },
        async (file) => collected.push(file),
      )
      if (collected.length) loadBatchFiles(collected)
    } finally {
      setBusy(false)
    }
  }

  // 拖拽：单个文件进单文件模式；多个文件切到批量模式。
  const acceptDroppedFiles = (files: File[]) => {
    if (!files.length) return
    if (files.length === 1) {
      setMode("single")
      void loadSingleFile(files[0]!)
      return
    }
    setMode("batch")
    loadBatchFiles(files)
  }

  const runBatch = async () => {
    if (!items.length) return
    setBusy(true)
    try {
      for (const item of items) {
        const idx = items.indexOf(item)
        const file = batchFiles.get(item.name)
        if (!file) {
          setItems(idx, "status", "error")
          setItems(idx, "error", "文件丢失")
          continue
        }
        try {
          const doc = await readFileText(file)
          setItems(idx, { fidelity: doc.fidelity, note: doc.note })
          setItems(idx, "result", redact(doc.text, options()))
          setItems(idx, "status", "done")
        } catch (error) {
          setItems(idx, "status", "error")
          setItems(idx, "error", String(error))
        }
      }
    } finally {
      setBusy(false)
    }
  }

  const reset = () => {
    setText("")
    setSourceName("")
    setResult(null)
    setSavedTo(null)
    setExtractNote(undefined)
    setFidelity("high")
  }

  const copyRedacted = async () => {
    const r = result()
    if (!r) return
    await navigator.clipboard.writeText(r.redacted)
    showToast({ title: t("redact.toast.copied") })
  }

  const copyBatchItem = async (item: BatchItem) => {
    if (!item.result) return
    await navigator.clipboard.writeText(item.result.redacted)
    showToast({ title: t("redact.toast.copied") })
  }

  const saveCopy = async () => {
    const r = result()
    if (!r || !platform.saveFilePickerDialog || !platform.writeTextFile) return
    const baseName = sourceName() || "案件.txt"
    const path = await platform.saveFilePickerDialog({
      title: t("redact.picker.save"),
      defaultPath: redactedCopyName(baseName),
    })
    if (!path) return
    await platform.writeTextFile(path, COPY_HEADER + r.redacted)
    setSavedTo(path)
    showToast({ title: t("redact.toast.saved") })
  }

  const saveMapping = async () => {
    const r = result()
    if (!r?.mapping.length || !platform.saveFilePickerDialog || !platform.writeTextFile) return
    const path = await platform.saveFilePickerDialog({
      title: t("redact.picker.saveMap"),
      defaultPath: "脱密对照表.md",
    })
    if (!path) return
    await platform.writeTextFile(path, mappingBody(r))
    showToast({ title: t("redact.toast.mapSaved") })
  }

  const saveAllBatch = async () => {
    const ready = items.filter((i) => i.result)
    if (!ready.length || platform.platform !== "desktop") return
    const write = platform.writeTextFile
    if (!write) return
    const dir = await platform.openDirectoryPickerDialog({ title: t("redact.picker.saveDir") })
    if (!dir || (typeof dir !== "string" && !dir.length)) return
    const outDir = typeof dir === "string" ? dir : dir[0]
    if (!outDir) return
    let saved = 0
    for (const item of ready) {
      const r = item.result!
      const path = joinPath(outDir, redactedCopyName(item.name))
      await write(path, COPY_HEADER + r.redacted)
      setItems(items.indexOf(item), "saved", true)
      saved++
    }
    showToast({ title: t("redact.toast.batchSaved", { count: saved }) })
  }

  const previewText = createMemo(() => {
    const r = result()
    if (!r) return text()
    return preview() === "redacted" ? r.redacted : text()
  })

  const batchDoneCount = createMemo(() => items.filter((i) => i.status === "done").length)

  return (
    <Dialog title={t("redact.title")} size="large" transition>
      <div class="flex flex-col gap-4 px-2.5 pb-3 overflow-y-auto max-h-[78vh] min-w-[560px]">
        <BetaHeader t={t} />

        <InfoPanel t={t} />

        <CustomizationPanel
          t={t}
          cats={cats()}
          toggleCat={toggleCat}
          rules={rules}
          setRules={setRules}
          addRule={addRule}
          removeRule={removeRule}
        />

        {/* 模式切换 */}
        <div class="flex rounded-md bg-fill-weak p-0.5 self-start">
          <For each={["single", "batch"] as const}>
            {(m) => (
              <button
                class="text-12-medium px-3 py-1 rounded-[4px] transition-colors"
                classList={{
                  "bg-surface-base text-text-strong": mode() === m,
                  "text-text-weak": mode() !== m,
                }}
                onClick={() => setMode(m)}
              >
                {t(`redact.mode.${m}`)}
              </button>
            )}
          </For>
        </div>

        <DropZone onFiles={acceptDroppedFiles} t={t}>
          <Show
            when={mode() === "single"}
            fallback={
              <BatchPanel
                t={t}
                busy={busy()}
                items={items}
                doneCount={batchDoneCount()}
                canPick={canPickFile()}
                canSave={canSaveFile()}
                isDesktop={isDesktop()}
                onPick={collectBatchFiles}
                onRun={runBatch}
                onSaveAll={saveAllBatch}
                onCopy={copyBatchItem}
              />
            }
          >
          <Show when={!result()}>
            <div class="flex flex-col gap-3">
              <Show when={canPickFile()}>
                <Button size="small" variant="secondary" icon="folder" onClick={pickFile} disabled={busy()} class="self-start">
                  {sourceName() ? sourceName() : t("redact.action.pickFile")}
                </Button>
                <Show when={fidelity() === "low"}>
                  <p class="text-12-regular text-warning-base">{extractNote() ?? t("redact.format.doc")}</p>
                </Show>
              </Show>
              <textarea
                class="w-full min-h-[200px] rounded-lg bg-surface-base px-3 py-2 text-14-regular text-text-strong border border-border-base resize-y focus:outline-none"
                placeholder={t("redact.input.placeholder")}
                value={text()}
                onInput={(e) => setText(e.currentTarget.value)}
              />
              <div class="flex items-center justify-between">
                <span class="text-12-regular text-text-weak">{t("redact.input.hint")}</span>
                <Button size="small" variant="primary" onClick={runRedact} disabled={!hasText()}>
                  {t("redact.action.run")}
                </Button>
              </div>
            </div>
          </Show>

          <Show when={result()}>
            {(r) => (
              <div class="flex flex-col gap-4">
                <ResultSummary t={t} result={r()} stats={stats()} scopes={scopes()} />

                <div class="flex flex-col gap-2">
                  <div class="flex items-center justify-between">
                    <span class="text-12-medium text-text-weak">{t("redact.preview.label")}</span>
                    <div class="flex rounded-md bg-fill-weak p-0.5">
                      <For each={["original", "redacted"] as const}>
                        {(m) => (
                          <button
                            class="text-12-regular px-2 py-0.5 rounded-[4px] transition-colors"
                            classList={{
                              "bg-surface-base text-text-strong": preview() === m,
                              "text-text-weak": preview() !== m,
                            }}
                            onClick={() => setPreview(m)}
                          >
                            {t(`redact.preview.${m}`)}
                          </button>
                        )}
                      </For>
                    </div>
                  </div>
                  <pre class="max-h-[240px] overflow-auto rounded-lg bg-surface-base px-3 py-2 text-12-regular text-text-base whitespace-pre-wrap break-all border border-border-base">
                    {previewText()}
                  </pre>
                </div>

                <Show when={r().mapping.length}>
                  <details class="rounded-lg border border-border-base px-3 py-2">
                    <summary class="text-12-medium text-text-weak cursor-pointer">
                      {t("redact.mapping.label", { count: r().mapping.length })}
                    </summary>
                    <table class="w-full mt-2 text-12-regular">
                      <thead>
                        <tr class="text-text-weak text-left">
                          <th class="font-normal py-1">{t("redact.mapping.token")}</th>
                          <th class="font-normal py-1">{t("redact.mapping.category")}</th>
                          <th class="font-normal py-1">{t("redact.mapping.value")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <For each={r().mapping}>
                          {(m) => (
                            <tr class="text-text-base">
                              <td class="py-0.5 pr-2">{m.token}</td>
                              <td class="py-0.5 pr-2">{CATEGORY_LABELS[m.category]}</td>
                              <td class="py-0.5">{m.value}</td>
                            </tr>
                          )}
                        </For>
                      </tbody>
                    </table>
                    <p class="text-12-regular text-warning-base mt-2">{t("redact.mapping.warning")}</p>
                  </details>
                </Show>

                <div class="flex flex-wrap items-center gap-2">
                  <Button size="small" variant="primary" onClick={copyRedacted}>
                    {t("redact.action.copy")}
                  </Button>
                  <Show
                    when={canSaveFile()}
                    fallback={<span class="text-12-regular text-text-weak">{t("redact.save.desktopOnly")}</span>}
                  >
                    <Button size="small" variant="secondary" icon="download" onClick={saveCopy}>
                      {t("redact.action.save")}
                    </Button>
                    <Show when={r().mapping.length}>
                      <Button size="small" variant="ghost" onClick={saveMapping}>
                        {t("redact.action.saveMap")}
                      </Button>
                    </Show>
                  </Show>
                  <div class="grow" />
                  <Button size="small" variant="ghost" onClick={reset}>
                    {t("redact.action.reset")}
                  </Button>
                </div>
                <Show when={savedTo()}>
                  {(path) => <p class="text-12-regular text-text-weak">{t("redact.savedAt", { path: path() })}</p>}
                </Show>
              </div>
            )}
          </Show>
        </Show>
        </DropZone>

        <ReviewBanner t={t} />
      </div>
    </Dialog>
  )
}

type T = (key: string, params?: Record<string, string | number | boolean>) => string

function DropZone(props: { onFiles: (files: File[]) => void; t: T; children: JSX.Element }) {
  const [dragging, setDragging] = createSignal(false)
  // 用计数器抵消子元素触发的 dragenter/dragleave，避免高亮闪烁。
  let depth = 0
  const endDrag = () => {
    depth = Math.max(0, depth - 1)
    if (depth === 0) setDragging(false)
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    depth = 0
    setDragging(false)
    const files = e.dataTransfer?.files ? [...e.dataTransfer.files] : []
    if (files.length) props.onFiles(files)
  }
  return (
    <div
      class="relative flex flex-col gap-2 rounded-lg p-0.5"
      classList={{ "ring-2 ring-icon-interactive-base bg-fill-weak": dragging() }}
      onDragEnter={(e) => {
        e.preventDefault()
        depth += 1
        setDragging(true)
      }}
      onDragOver={(e) => {
        e.preventDefault()
        if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"
      }}
      onDragLeave={(e) => {
        e.preventDefault()
        endDrag()
      }}
      onDrop={onDrop}
    >
      <span class="self-center text-11-regular text-text-weak">{props.t("redact.drop.badge")}</span>
      {props.children}
      <Show when={dragging()}>
        <div class="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-surface-base/60">
          <span class="rounded-md bg-surface-base px-3 py-1 text-12-medium text-text-strong shadow">
            {props.t("redact.drop.hint")}
          </span>
        </div>
      </Show>
    </div>
  )
}

function BetaHeader(props: { t: T }) {
  return (
    <div class="flex flex-col gap-1">
      <div class="flex items-center gap-2">
        <span class="text-14-medium text-text-strong">{props.t("redact.title")}</span>
        <span class="text-10-medium rounded bg-icon-interactive-base text-[#FFF] px-1.5 py-0.5 uppercase">
          {props.t("redact.beta")}
        </span>
      </div>
      <p class="text-12-regular text-warning-base">{props.t("redact.beta.disclaimer")}</p>
      <p class="text-14-regular text-text-base">{props.t("redact.description")}</p>
    </div>
  )
}

function InfoPanel(props: { t: T }) {
  return (
    <details class="rounded-lg border border-border-base px-3 py-2">
      <summary class="text-12-medium text-text-weak cursor-pointer">{props.t("redact.info.title")}</summary>
      <div class="flex flex-col gap-2 mt-2 text-12-regular text-text-base">
        <p>{props.t("redact.info.principle")}</p>
        <p>{props.t("redact.info.coverage")}</p>
        <p>{props.t("redact.info.limitations")}</p>
        <div class="flex flex-col gap-0.5 text-text-weak">
          <span class="text-12-medium text-text-base">{props.t("redact.format.label")}</span>
          <span>{props.t("redact.format.text")}</span>
          <span>{props.t("redact.format.docx")}</span>
          <span>{props.t("redact.format.doc")}</span>
        </div>
      </div>
    </details>
  )
}

function CustomizationPanel(props: {
  t: T
  cats: Set<Category>
  toggleCat: (cat: Category) => void
  rules: UiRule[]
  setRules: (fn: (list: UiRule[]) => UiRule[]) => void
  addRule: () => void
  removeRule: (i: number) => void
}) {
  return (
    <details class="rounded-lg border border-border-base px-3 py-2" open>
      <summary class="text-12-medium text-text-weak cursor-pointer">{props.t("redact.custom.title")}</summary>
      <div class="flex flex-col gap-3 mt-2">
        <span class="text-12-regular text-text-weak">{props.t("redact.custom.hint")}</span>
        <div class="flex flex-col gap-1">
          <span class="text-12-medium text-text-base">{props.t("redact.custom.categories")}</span>
          <div class="flex flex-wrap gap-1.5">
            <For each={TOGGLE_CATEGORIES}>
              {(cat) => (
                <label class="flex items-center gap-1 text-12-regular text-text-base cursor-pointer">
                  <input type="checkbox" checked={props.cats.has(cat)} onChange={() => props.toggleCat(cat)} />
                  {CATEGORY_LABELS[cat]}
                </label>
              )}
            </For>
          </div>
        </div>
        <div class="flex flex-col gap-2">
          <span class="text-12-medium text-text-base">{props.t("redact.custom.rules")}</span>
          <For each={props.rules}>
            {(rule, i) => (
              <div class="flex items-center gap-2">
                <input
                  class="w-28 rounded-md bg-surface-base px-2 py-1 text-12-regular border border-border-base"
                  placeholder={props.t("redact.custom.ruleName")}
                  value={rule.name}
                  onInput={(e) => props.setRules((list) => list.map((r, idx) => (idx === i() ? { ...r, name: e.currentTarget.value } : r)))}
                />
                <input
                  class="flex-1 rounded-md bg-surface-base px-2 py-1 text-12-regular border border-border-base"
                  placeholder={props.t("redact.custom.rulePattern")}
                  value={rule.pattern}
                  onInput={(e) => props.setRules((list) => list.map((r, idx) => (idx === i() ? { ...r, pattern: e.currentTarget.value } : r)))}
                />
                <input
                  class="w-16 rounded-md bg-surface-base px-2 py-1 text-12-regular border border-border-base"
                  placeholder={props.t("redact.custom.ruleFlags")}
                  value={rule.flags}
                  onInput={(e) => props.setRules((list) => list.map((r, idx) => (idx === i() ? { ...r, flags: e.currentTarget.value } : r)))}
                />
                <Button size="small" variant="ghost" onClick={() => props.removeRule(i())}>
                  {props.t("redact.action.removeRule")}
                </Button>
              </div>
            )}
          </For>
          <Button size="small" variant="secondary" onClick={props.addRule} class="self-start">
            {props.t("redact.action.addRule")}
          </Button>
        </div>
      </div>
    </details>
  )
}

function ResultSummary(props: {
  t: T
  result: RedactionResult
  stats: Array<[Category, number]>
  scopes: Array<{ key: string; label: string }>
}) {
  return (
    <div class="rounded-lg bg-surface-base px-3 py-2.5 flex flex-col gap-2 border border-border-base">
      <div class="text-14-medium text-text-strong">
        {props.t("redact.summary", { findings: props.result.findings.length, mapping: props.result.mapping.length })}
      </div>
      <Show when={props.stats.length}>
        <div class="flex flex-wrap gap-1.5">
          <For each={props.stats}>
            {([cat, n]) => (
              <span class="text-12-regular rounded-md bg-fill-weak px-2 py-0.5 text-text-base">
                {CATEGORY_LABELS[cat]} · {n}
              </span>
            )}
          </For>
        </div>
      </Show>
      <Show when={props.scopes.length}>
        <div class="flex items-center gap-2 mt-0.5">
          <span class="text-12-medium text-warning-base">{props.t("redact.scope.warning")}</span>
          <For each={props.scopes}>
            {(s) => (
              <span class="text-12-medium text-warning-base rounded-md bg-warning-weak px-2 py-0.5">{s.label}</span>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}

function ReviewBanner(props: { t: T }) {
  return (
    <div class="rounded-lg border border-warning-base bg-warning-weak px-3 py-2.5 flex flex-col gap-1">
      <span class="text-12-medium text-warning-base">{props.t("redact.review.title")}</span>
      <span class="text-12-regular text-text-base">{props.t("redact.review.body")}</span>
    </div>
  )
}

function BatchPanel(props: {
  t: T
  busy: boolean
  items: BatchItem[]
  doneCount: number
  canPick: boolean
  canSave: boolean
  isDesktop: boolean
  onPick: () => void
  onRun: () => void
  onSaveAll: () => void
  onCopy: (item: BatchItem) => void
}) {
  return (
    <div class="flex flex-col gap-3">
      <div class="flex flex-wrap items-center gap-2">
        <Show
          when={props.canPick}
          fallback={<span class="text-12-regular text-text-weak">{props.t("redact.save.desktopOnly")}</span>}
        >
          <Button size="small" variant="secondary" icon="folder" onClick={props.onPick} disabled={props.busy}>
            {props.t("redact.action.pickFiles")}
          </Button>
        </Show>
        <Button
          size="small"
          variant="primary"
          onClick={props.onRun}
          disabled={props.busy || !props.items.length}
        >
          {props.t("redact.action.runAll")}
        </Button>
        <Show when={props.isDesktop && props.doneCount > 0}>
          <Button size="small" variant="secondary" icon="download" onClick={props.onSaveAll} disabled={props.busy}>
            {props.t("redact.action.saveAll")}
          </Button>
        </Show>
        <span class="text-12-regular text-text-weak">
          {props.items.length ? props.t("redact.batch.count", { count: props.items.length }) : props.t("redact.batch.empty")}
        </span>
      </div>
      <Show when={props.items.length}>
        <div class="flex flex-col gap-1 max-h-[320px] overflow-y-auto">
          <For each={props.items}>
            {(item) => (
              <div class="flex items-center gap-2 rounded-md bg-surface-base px-3 py-2 border border-border-base">
                <div class="flex flex-col min-w-0 flex-1 gap-0.5">
                  <span class="text-12-medium text-text-strong truncate">{item.name}</span>
                  <span class="text-12-regular text-text-weak">
                    <Show when={item.status === "done" && item.result}>
                      {props.t("redact.summary", {
                        findings: item.result!.findings.length,
                        mapping: item.result!.mapping.length,
                      })}
                    </Show>
                    <Show when={item.status === "pending"}>{props.t("redact.batch.status")}</Show>
                    <Show when={item.status === "error"}>
                      <span class="text-critical-base">{item.error}</span>
                    </Show>
                    <Show when={item.fidelity === "low"}> · {props.t("redact.batch.fidelityLow")}</Show>
                  </span>
                </div>
                <Show when={item.result}>
                  <Button size="small" variant="ghost" onClick={() => props.onCopy(item)}>
                    {props.t("redact.action.copy")}
                  </Button>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
