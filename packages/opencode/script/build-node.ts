#!/usr/bin/env bun

import { Script } from "@fama-ai/script"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dir = path.resolve(__dirname, "..")

process.chdir(dir)

const generated = await import("./generate.ts")

// 供桌面端 electron-vite 以 virtual:fama-server 内嵌引擎（见 packages/desktop/electron.vite.config.ts）
await Bun.build({
  target: "node",
  entrypoints: ["./src/node.ts"],
  outdir: "./dist/node",
  format: "esm",
  sourcemap: "linked",
  external: ["jsonc-parser", "@lydell/node-pty"],
  // 桌面内嵌场景不提供 web UI：给 ui.ts 的动态导入注入空模块，避免上层打包器解析失败
  files: { "opencode-web-ui.gen.ts": "" },
  define: {
    FAMA_VERSION: `'${Script.version}'`,
    FAMA_MODELS_DEV: generated.modelsData,
    FAMA_CHANNEL: `'${Script.channel}'`,
  },
})

console.log("Build complete")
