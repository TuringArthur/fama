import { expect, test } from "bun:test"
import type { Configuration } from "electron-builder"

const channels = [
  { channel: "dev", appId: "ai.fama.desktop.dev" },
  { channel: "beta", appId: "ai.fama.desktop.beta" },
  { channel: "prod", appId: "ai.fama.desktop" },
] as const

for (const channel of channels) {
  test(`uses one Linux desktop identity for ${channel.channel}`, async () => {
    const previous = process.env.FAMA_CHANNEL
    process.env.FAMA_CHANNEL = channel.channel

    const module = await import(`./electron-builder.config.ts?channel=${channel.channel}`)
    const config = module.default as Configuration

    if (previous === undefined) delete process.env.FAMA_CHANNEL
    else process.env.FAMA_CHANNEL = previous

    expect(config.appId).toBe(channel.appId)
    expect(config.extraMetadata?.desktopName).toBe(`${channel.appId}.desktop`)
    expect(config.linux?.executableName).toBe(channel.appId)
    expect(config.linux?.desktop?.entry?.StartupWMClass).toBe(channel.appId)
  })
}
