import { Formatter, Logger, type LogLevel } from "effect"
import path from "path"
import { Global } from "../global"
import { runID } from "./shared"

function formatter(id: string = runID) {
  return Logger.map(Logger.formatStructured, (output) => {
    const messages = Array.isArray(output.message) ? output.message : [output.message]
    return [
      ["timestamp", output.timestamp],
      ["level", output.level],
      ["run", id],
      ...messages.flatMap((value) => (plain(value) ? flatten(value) : [["message", value] as const])),
      ...(output.cause === undefined ? [] : [["cause", output.cause] as const]),
      ...flatten(output.spans),
      ...flatten(output.annotations),
    ]
      .map(([key, value]) => `${key}=${format(value)}`)
      .join(" ")
  })
}

function flatten(
  input: Record<string, unknown>,
  prefix = "",
  seen = new WeakSet<object>(),
): Array<readonly [string, unknown]> {
  if (seen.has(input)) return [[prefix, "[Circular]"]]
  seen.add(input)
  const entries = Object.entries(input)
  if (entries.length === 0 && prefix) return [[prefix, input]]
  return entries.flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return plain(value) ? flatten(value, path, seen) : [[path, value] as const]
  })
}

function plain(input: unknown): input is Record<string, unknown> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return false
  const prototype = Object.getPrototypeOf(input)
  return prototype === Object.prototype || prototype === null
}

// 日志脱敏（写入侧）：过滤身份证号/案号/手机号，避免案件材料泄入日志文件。
const REDACTIONS: Array<[RegExp, string]> = [
  // 18 位身份证号（含校验位 X）
  [/\b\d{6}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/g, "[身份证号已脱敏]"],
  // 案号：如 （2024）京01民终123号 / (2023)最高法民再12号
  [/[（(]\s*(?:19|20)\d{2}\s*[）)][^\s，。；;（）()]{0,20}?\d{0,10}号/g, "[案号已脱敏]"],
  // 大陆手机号
  [/\b1[3-9]\d{9}\b/g, "[手机号已脱敏]"],
]

function redact(value: string) {
  return REDACTIONS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), value)
}

function format(input: unknown) {
  const raw = typeof input === "string" ? input : Formatter.format(input)
  const value = redact(raw)
  return /^[^\s="\\]+$/.test(value) ? value : JSON.stringify(value)
}

export function fileLogger(file = path.join(Global.Path.log, "opencode.log"), id: string = runID) {
  // Do not set batchWindow to 0; it causes high idle CPU usage.
  return Logger.toFile(formatter(id), file, { flag: "a" })
}

const stderrLogger = Logger.make((options) => process.stderr.write(formatter().log(options) + "\n"))

export function minimumLogLevel() {
  const value = process.env.FAMA_LOG_LEVEL?.toUpperCase()
  const levels = {
    DEBUG: "Debug",
    INFO: "Info",
    WARN: "Warn",
    ERROR: "Error",
  } as const satisfies Record<string, LogLevel.LogLevel>
  return value && value in levels ? levels[value as keyof typeof levels] : levels.INFO
}

export function loggers() {
  return process.env.FAMA_PRINT_LOGS === "1" ? [fileLogger(), stderrLogger] : [fileLogger()]
}

export * as Logging from "./logging"
