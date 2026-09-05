import { createSignal, For, onMount } from "solid-js"
import { Dialog } from "@fama-ai/ui/dialog"
import { Button } from "@fama-ai/ui/button"
import { useDialog } from "@fama-ai/ui/context/dialog"
import { Splash } from "@fama-ai/ui/logo"
import { useLanguage } from "@/context/language"
import { DialogConnectProvider } from "./dialog-connect-provider"
import { DialogSelectProvider } from "./dialog-select-provider"

const ONBOARDED_KEY = "fama-onboarded-v1"
const ROLE_KEY = "fama-role"

const ROLES = [
  { id: "lawyer", labelKey: "dialog.onboarding.role.lawyer", agent: "lawyer" },
  { id: "counsel", labelKey: "dialog.onboarding.role.counsel", agent: "counsel" },
  { id: "judge", labelKey: "dialog.onboarding.role.judge", agent: "judge" },
  { id: "prosecutor", labelKey: "dialog.onboarding.role.prosecutor", agent: "prosecutor" },
  { id: "student", labelKey: "dialog.onboarding.role.student", agent: "lawyer" },
  { id: "developer", labelKey: "dialog.onboarding.role.developer", agent: "build" },
]

function finishOnboarding(role?: string) {
  localStorage.setItem(ONBOARDED_KEY, "1")
  if (role) localStorage.setItem(ROLE_KEY, role)
}

export function DialogOnboarding() {
  const dialog = useDialog()
  const language = useLanguage()
  const [role, setRole] = createSignal<string>(localStorage.getItem(ROLE_KEY) ?? "lawyer")

  const close = () => dialog.close()

  const bindKey = () => {
    finishOnboarding(role())
    close()
    dialog.show(() => <DialogSelectProvider />)
  }

  const zen = () => {
    finishOnboarding(role())
    close()
    dialog.show(() => <DialogConnectProvider provider="opencode" />)
  }

  const later = () => {
    finishOnboarding(role())
    close()
  }

  return (
    <Dialog class="w-[min(calc(100vw-40px),480px)]">
      <div class="flex flex-col gap-5 p-6">
        <div class="flex items-center gap-3">
          <Splash class="w-8 h-10" />
          <h1 class="text-16-medium text-text-strong">{language.t("dialog.onboarding.title")}</h1>
        </div>
        <p class="text-13-regular text-text-base">{language.t("dialog.onboarding.description")}</p>

        <div class="flex flex-wrap gap-2">
          <For each={ROLES}>
            {(item) => (
              <button
                type="button"
                class="px-3 py-1.5 rounded-full border text-13-regular cursor-pointer transition-colors"
                classList={{
                  "border-transparent bg-primary text-white": role() === item.id,
                  "border-border-weak-base text-text-base hover:bg-surface-raised-base-hover": role() !== item.id,
                }}
                onClick={() => setRole(item.id)}
              >
                {language.t(item.labelKey)}
              </button>
            )}
          </For>
        </div>

        <div class="flex flex-col gap-2">
          <Button variant="primary" size="large" onClick={bindKey}>
            {language.t("dialog.onboarding.action.bindKey")}
          </Button>
          <Button variant="secondary" size="large" onClick={zen}>
            {language.t("dialog.onboarding.action.zen")}
          </Button>
          <Button variant="ghost" size="small" onClick={later}>
            {language.t("dialog.onboarding.action.later")}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

/** Shows the onboarding dialog once, on first app launch. */
export function OnboardingGate() {
  const dialog = useDialog()
  onMount(() => {
    if (localStorage.getItem(ONBOARDED_KEY)) return
    dialog.show(() => <DialogOnboarding />)
  })
  return null
}
