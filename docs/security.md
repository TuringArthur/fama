# Fama 安全与合规工程

面向法律场景的默认安全基线。所有机制均为「默认生效、可配置关闭」，不改变 Fama 的其他行为。

## 1. 离线模式（律所保密场景）

在 `fama.json`（全局 `~/.config/fama/fama.json` 或项目 `.fama/fama.json`）中：

```json
{
  "$schema": "https://fama.stdlaw.cn/config.json",
  "privacy": {
    "offline": true
  }
}
```

也可用环境变量 `FAMA_OFFLINE=1` 独立强制（优先级低于配置，但无需改配置文件即可临时启用）。

开启后的生效点：

| 生效点 | 行为 |
| --- | --- |
| `webfetch` / `websearch` | 从工具列表移除，模型不可调用 |
| `law_search` / `case_search` | 本地法条库照常可用；在线请求跳过并返回降级建议 |
| 远端（streamableHttp）MCP 服务 | 启动时跳过，状态记为 disabled；本地 stdio MCP 不受影响 |
| 自动升级检查 | 跳过（等同 `autoupdate: false`） |

配合 Ollama 等本地模型（在 `provider` 中自定义 OpenAI 兼容端点）即可实现全离线运行。

## 2. 日志脱敏

日志写入侧（`opencode.log` 与 stderr）自动过滤三类敏感信息，无需配置：

- 18 位身份证号 → `[身份证号已脱敏]`
- 案号（如 `（2024）京01民终123号`）→ `[案号已脱敏]`
- 大陆手机号 → `[手机号已脱敏]`

规则为正则匹配，仅覆盖日志通道；会话内容由本地 SQLite（`opencode.db`）保存，不上传任何服务器。

## 3. 出站 URL 防护（SSRF）

`webfetch`、`law_search`、`case_search` 等发起网络请求前统一校验：

- 仅允许 `http` / `https` 协议；
- 拒绝内嵌用户名/密码的 URL；
- 拒绝 `localhost`、`*.localhost`、`*.local`、`*.internal` 等本地主机名；
- 拒绝私有/保留地址的 IP 字面量（IPv4 全部保留段，IPv6 的 `::`、`::1`、ULA `fc00::/7`、链路本地 `fe80::/10`、NAT64 `64:ff9b::/96` 及 IPv4 映射地址）。

已知边界：校验发生在请求前的静态阶段；「域名经 DNS 解析后落在私网」的绕过方式需在部署环境（容器网络策略/出口防火墙）兜底。涉密环境建议直接开启离线模式。

## 4. 输出合规

- 文书类输出（`document_render`）默认在文末追加：**「本文由人工智能辅助生成，供参考，不构成法律意见。」**（符合《人工智能生成合成内容标识办法》，可用 `aiLabel: false` 关闭）；
- `law_get` / 本地检索结果固定附带「本地索引为静态快照，法条可能已修订」的时效警示；
- `citation_check` 对文书中引用的《XX法》第X条逐一与本地法条库核对，未命中即标注。

## 5. 供应链安全

- 依赖以 `bun.lock` 锁定，CI 使用 `bun install --frozen-lockfile`；
- CI（`.github/workflows/fama-ci.yml`）在每次 push / PR 上运行 lint + typecheck + gitleaks 密钥扫描；
- 上游同步采用精选 cherry-pick（见 [sync-upstream.md](./sync-upstream.md)），不整体 merge，合并前过 CI；
- 凭据一律走环境变量（如 `{env:PKULAW_MCP_TOKEN}` 插值），源码、示例与测试不写入可用凭据字面量。
