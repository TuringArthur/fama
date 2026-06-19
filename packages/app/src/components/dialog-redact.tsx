import { Button } from "@fama-ai/ui/button"
import { Dialog } from "@fama-ai/ui/dialog"
import { useDialog } from "@fama-ai/ui/context/dialog"
import { showToast } from "@/utils/toast"
import {
  type Category,
  type RedactionResult,
  CATEGORY_LABELS,
  redact,
  redactedCopyName,
} from "@fama-ai/core/redact"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { createMemo, createSignal, For, Match, Show, Switch } from "solid-js"

const REDACTABLE_EXT = [".txt", ".md", ".markdown", ".text"]

const COPY_HEADER = [
  `# 案件脱密副本`,
  ``,
  `> 本副本由 Fama 脱密工具生成，已去除敏感信息，可安全上传到 AI 平台协同处理。`,
  ``,
  `---`,
  ``,
].join("\n")

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

export function DialogRedact() {
  const dialog = useDialog()
  const language = useLanguage()
  const platform = usePlatform()
  const t = (key: string, params?: Record<string, string | number | boolean>) => language.t(key, params)

  const [sourceName, setSourceName] = createSignal<string>("")
  const [text, setText] = createSignal<string>("")
  const [result, setResult] = createSignal<RedactionResult | null>(null)
  const [preview, setPreview] = createSignal<"original" | "redacted">("redacted")
  const [busy, setBusy] = createSignal(false)
  const [savedTo, setSavedTo] = createSignal<string | null>(null)

  const hasText = createMemo(() => text().trim().length > 0)
  const canPickFile = createMemo(() => !!platform.openAttachmentPickerDialog)
  const canSaveFile = createMemo(() => !!platform.writeTextFile && !!platform.saveFilePickerDialog)

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

  const pickFile = async () => {
    if (!platform.openAttachmentPickerDialog) return
    setBusy(true)
    try {
      await platform.openAttachmentPickerDialog(
        { extensions: REDACTABLE_EXT, title: t("redact.picker.open") },
        async (file) => {
          const content = await file.text()
          setText(content)
          setSourceName(file.name)
          setResult(null)
          setSavedTo(null)
        },
      )
    } finally {
      setBusy(false)
    }
  }

  const runRedact = () => {
    const input = text()
    if (!input.trim()) return
    setResult(redact(input))
    setPreview("redacted")
    setSavedTo(null)
  }

  const reset = () => {
    setText("")
    setSourceName("")
    setResult(null)
    setSavedTo(null)
  }

  const copyRedacted = async () => {
    const r = result()
    if (!r) return
    await navigator.clipboard.writeText(r.redacted)
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

  const previewText = createMemo(() => {
    const r = result()
    if (!r) return text()
    return preview() === "redacted" ? r.redacted : text()
  })

  return (
    <Dialog title={t("redact.title")} size="large" transition>
      <div class="flex flex-col gap-4 px-2.5 pb-3 overflow-y-auto max-h-[70vh] min-w-[520px]">
        <p class="text-14-regular text-text-base">{t("redact.description")}</p>

        <Show when={!result()}>
          {/* 输入阶段 */}
          <div class="flex flex-col gap-3">
            <Show when={canPickFile()}>
              <Button
                size="small"
                variant="secondary"
                icon="folder"
                onClick={pickFile}
                disabled={busy()}
                class="self-start"
              >
                {sourceName() ? sourceName() : t("redact.action.pickFile")}
              </Button>
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
              {/* 汇总 */}
              <div class="rounded-lg bg-surface-base px-3 py-2.5 flex flex-col gap-2 border border-border-base">
                <div class="text-14-medium text-text-strong">
                  {t("redact.summary", { findings: r().findings.length, mapping: r().mapping.length })}
                </div>
                <Show when={stats().length}>
                  <div class="flex flex-wrap gap-1.5">
                    <For each={stats()}>
                      {([cat, n]) => (
                        <span class="text-12-regular rounded-md bg-fill-weak px-2 py-0.5 text-text-base">
                          {CATEGORY_LABELS[cat]} · {n}
                        </span>
                      )}
                    </For>
                  </div>
                </Show>
                <Show when={scopes().length}>
                  <div class="flex items-center gap-2 mt-0.5">
                    <span class="text-12-medium text-warning-base">{t("redact.scope.warning")}</span>
                    <For each={scopes()}>
                      {(s) => (
                        <span class="text-12-medium text-warning-base rounded-md bg-warning-weak px-2 py-0.5">
                          {s.label}
                        </span>
                      )}
                    </For>
                  </div>
                </Show>
              </div>

              {/* 前后对比预览 */}
              <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between">
                  <span class="text-12-medium text-text-weak">{t("redact.preview.label")}</span>
                  <div class="flex rounded-md bg-fill-weak p-0.5">
                    <For each={["original", "redacted"] as const}>
                      {(mode) => (
                        <button
                          class="text-12-regular px-2 py-0.5 rounded-[4px] transition-colors"
                          classList={{
                            "bg-surface-base text-text-strong": preview() === mode,
                            "text-text-weak": preview() !== mode,
                          }}
                          onClick={() => setPreview(mode)}
                        >
                          {t(`redact.preview.${mode}`)}
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

              {/* 操作 */}
              <div class="flex flex-wrap items-center gap-2">
                <Button size="small" variant="primary" onClick={copyRedacted}>
                  {t("redact.action.copy")}
                </Button>
                <Show when={canSaveFile()} fallback={<span class="text-12-regular text-text-weak">{t("redact.save.desktopOnly")}</span>}>
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
      </div>
    </Dialog>
  )
}
