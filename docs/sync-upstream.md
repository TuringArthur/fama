# 上游精选同步（cherry-pick 流程）

Fama 是 opencode 的 hard fork：历史已独立演进，**不做全量 merge**，只按需摘取上游（[sst/opencode](https://github.com/sst/opencode)）的关键修复。节奏建议每季度一次，或在上游发布重要安全/模型适配修复时随时进行。

## 1. 一次性准备

```bash
git remote add upstream https://github.com/sst/opencode.git
git fetch upstream
```

## 2. 浏览上游变更

```bash
# 按时间浏览主分支提交
git log --oneline upstream/dev --since="3 months ago" --no-merges | less

# 只看涉及核心引擎的提交
git log --oneline upstream/dev --no-merges -- packages/opencode/src packages/core/src | less
```

优先级从高到低：

1. **安全修复**（请求伪造、路径穿越、沙箱逃逸、依赖漏洞升级）；
2. **模型适配**（新增 provider、修 API 变更、修 token 截断）——这类不摘会导致新模型不可用；
3. **引擎缺陷修复**（会话崩溃、数据丢失、工具执行错误）；
4. 桌面端/Electron 的崩溃修复。

UI、营销站（packages/console）、TUI 主题类变更**默认不摘**——Fama 已有自己的法律化外观。

## 3. 摘取

```bash
git cherry-pick <sha>
# 多个不连续提交：
git cherry-pick <sha1> <sha2>
```

冲突处理原则：涉及「禁改区」的文件（见下）一律保留 Fama 版本；其余以上游修复为准。

## 4. 禁改区（冲突时以 Fama 为准）

- provider id `"opencode"` 与 `OPENCODE_API_KEY`、`apiKey: "public"` 兜底——zen/go 服务的身份标识；
- OAuth client_id `"opencode-cli"`、opencode.ai / console.opencode.ai / models.dev 相关 URL；
- 错误标记 `FreeUsageLimitError` / `GoUsageLimitError`；
- `x-opencode-directory` 协议头、`opencode.db` 文件名；
- 主题（`oc-2.json` / TUI `opencode.json`）、字体、品牌文案、`skill/index.ts` 内置技能源、工具注册表中的法律工具。

## 5. 验证

```bash
bun install            # 上游若改了依赖，先同步锁文件再核对 diff
bun run lint
bun run typecheck
bun script/perf-baseline.ts   # 与 perf/results 基线对比，bundle 体积无异常增长
```

全部通过后推送，由 CI（lint + typecheck + gitleaks）做最终把关。
