declare global {
  const FAMA_VERSION: string
  const FAMA_CHANNEL: string
}

export const InstallationVersion = typeof FAMA_VERSION === "string" ? FAMA_VERSION : "local"
export const InstallationChannel = typeof FAMA_CHANNEL === "string" ? FAMA_CHANNEL : "local"
export const InstallationLocal = InstallationChannel === "local"
