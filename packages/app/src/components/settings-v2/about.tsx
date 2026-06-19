import { Component } from "solid-js"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import logo from "@/assets/logo.png"

export const SettingsAboutV2: Component = () => {
  const language = useLanguage()
  const platform = usePlatform()

  return (
    <div class="flex flex-col gap-6 p-6">
      <div class="flex flex-col items-center gap-4 py-8">
        <img src={logo} alt="Fama Logo" class="w-24 h-24" />
        <h1 class="text-2xl font-bold">{language.t("app.name.desktop")}</h1>
        <p class="text-sm text-gray-500">v{platform.version}</p>
      </div>

      <div class="bg-surface-base rounded-lg p-4">
        <h2 class="text-lg font-semibold mb-3">{language.t("settings.about.description")}</h2>
        <p class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
          {language.t("settings.about.descriptionText")}
        </p>
      </div>

      <div class="bg-surface-base rounded-lg p-4">
        <h2 class="text-lg font-semibold mb-3">{language.t("settings.about.features")}</h2>
        <ul class="text-sm text-gray-600 dark:text-gray-400 space-y-2">
          <li class="flex items-start gap-2">
            <span class="text-green-500 mt-0.5">✓</span>
            <span>{language.t("settings.about.feature1")}</span>
          </li>
          <li class="flex items-start gap-2">
            <span class="text-green-500 mt-0.5">✓</span>
            <span>{language.t("settings.about.feature2")}</span>
          </li>
          <li class="flex items-start gap-2">
            <span class="text-green-500 mt-0.5">✓</span>
            <span>{language.t("settings.about.feature3")}</span>
          </li>
          <li class="flex items-start gap-2">
            <span class="text-green-500 mt-0.5">✓</span>
            <span>{language.t("settings.about.feature4")}</span>
          </li>
        </ul>
      </div>

      <div class="bg-surface-base rounded-lg p-4">
        <h2 class="text-lg font-semibold mb-3">{language.t("settings.about.contact")}</h2>
        <div class="text-sm text-gray-600 dark:text-gray-400 space-y-1">
          <p>{language.t("settings.about.website")}: <a href="https://fama.stdalw.cn" class="text-blue-500 hover:underline" target="_blank">fama.stdalw.cn</a></p>
          <p>{language.t("settings.about.email")}: <a href="mailto:service@stdlaw.cn" class="text-blue-500 hover:underline">service@stdlaw.cn</a></p>
        </div>
      </div>

      <div class="text-center text-xs text-gray-400 py-4">
        <p>{language.t("settings.about.copyright")}</p>
      </div>
    </div>
  )
}
