import { Config } from "effect"

export function truthy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "true" || value === "1"
}

const copy = process.env["FAMA_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"]
const fff = process.env["FAMA_DISABLE_FFF"]

function enabledByExperimental(key: string) {
  return process.env[key] === undefined ? truthy("FAMA_EXPERIMENTAL") : truthy(key)
}

export const Flag = {
  OTEL_EXPORTER_OTLP_ENDPOINT: process.env["OTEL_EXPORTER_OTLP_ENDPOINT"],
  OTEL_EXPORTER_OTLP_HEADERS: process.env["OTEL_EXPORTER_OTLP_HEADERS"],

  FAMA_AUTO_HEAP_SNAPSHOT: truthy("FAMA_AUTO_HEAP_SNAPSHOT"),
  FAMA_GIT_BASH_PATH: process.env["FAMA_GIT_BASH_PATH"],
  FAMA_CONFIG: process.env["FAMA_CONFIG"],
  FAMA_CONFIG_CONTENT: process.env["FAMA_CONFIG_CONTENT"],
  FAMA_DISABLE_AUTOUPDATE: truthy("FAMA_DISABLE_AUTOUPDATE"),
  FAMA_ALWAYS_NOTIFY_UPDATE: truthy("FAMA_ALWAYS_NOTIFY_UPDATE"),
  FAMA_DISABLE_PRUNE: truthy("FAMA_DISABLE_PRUNE"),
  FAMA_DISABLE_TERMINAL_TITLE: truthy("FAMA_DISABLE_TERMINAL_TITLE"),
  FAMA_SHOW_TTFD: truthy("FAMA_SHOW_TTFD"),
  FAMA_DISABLE_AUTOCOMPACT: truthy("FAMA_DISABLE_AUTOCOMPACT"),
  FAMA_DISABLE_MODELS_FETCH: truthy("FAMA_DISABLE_MODELS_FETCH"),
  FAMA_DISABLE_MOUSE: truthy("FAMA_DISABLE_MOUSE"),
  FAMA_FAKE_VCS: process.env["FAMA_FAKE_VCS"],
  FAMA_SERVER_PASSWORD: process.env["FAMA_SERVER_PASSWORD"],
  FAMA_SERVER_USERNAME: process.env["FAMA_SERVER_USERNAME"],
  FAMA_DISABLE_FFF: fff === undefined ? process.platform === "win32" : truthy("FAMA_DISABLE_FFF"),

  // Experimental
  FAMA_EXPERIMENTAL_FILEWATCHER: Config.boolean("FAMA_EXPERIMENTAL_FILEWATCHER").pipe(
    Config.withDefault(false),
  ),
  FAMA_EXPERIMENTAL_DISABLE_FILEWATCHER: Config.boolean("FAMA_EXPERIMENTAL_DISABLE_FILEWATCHER").pipe(
    Config.withDefault(false),
  ),
  FAMA_EXPERIMENTAL_DISABLE_COPY_ON_SELECT:
    copy === undefined ? process.platform === "win32" : truthy("FAMA_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"),
  FAMA_MODELS_URL: process.env["FAMA_MODELS_URL"],
  FAMA_MODELS_PATH: process.env["FAMA_MODELS_PATH"],
  FAMA_DB: process.env["FAMA_DB"],

  FAMA_WORKSPACE_ID: process.env["FAMA_WORKSPACE_ID"],
  FAMA_EXPERIMENTAL_WORKSPACES: enabledByExperimental("FAMA_EXPERIMENTAL_WORKSPACES"),

  // Evaluated at access time (not module load) because tests, the CLI, and
  // external tooling set these env vars at runtime.
  get FAMA_DISABLE_PROJECT_CONFIG() {
    return truthy("FAMA_DISABLE_PROJECT_CONFIG")
  },
  get FAMA_EXPERIMENTAL_REFERENCES() {
    return enabledByExperimental("FAMA_EXPERIMENTAL_REFERENCES")
  },
  get FAMA_TUI_CONFIG() {
    return process.env["FAMA_TUI_CONFIG"]
  },
  get FAMA_CONFIG_DIR() {
    return process.env["FAMA_CONFIG_DIR"]
  },
  get FAMA_PURE() {
    return truthy("FAMA_PURE")
  },
  get FAMA_PERMISSION() {
    return process.env["FAMA_PERMISSION"]
  },
  get FAMA_PLUGIN_META_FILE() {
    return process.env["FAMA_PLUGIN_META_FILE"]
  },
  get FAMA_CLIENT() {
    return process.env["FAMA_CLIENT"] ?? "cli"
  },
}
